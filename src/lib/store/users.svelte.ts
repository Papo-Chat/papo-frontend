// Users store: summaries (byId), lazy profiles (byId), ephemeral presence,
// typing (TTL), and a keyset list.
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { api } from '../api';
import { blobToUrl } from '../utils/media';
import { currentSessionEpoch, isCurrentSessionEpoch } from '../utils/session-epoch';
import type { UserSummary, UserProfile, KeysetCursor, PresenceStatus } from '../types';

const TYPING_TTL = 5000; // ms
// Real timers are required because Date.now() is not reactive. The TTL stored
// in state remains useful as a fallback for delayed/suspended browser timers.

const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
let joinNoticeSerial = 0;
let consumedJoinNoticeSerial = 0;

const PROFILE_CACHE_TARGET = 75;
const PROFILE_CACHE_MAX = 120;
const USER_LIST_MAX = 300;
const SUMMARY_CACHE_TARGET = 1000;
const SUMMARY_CACHE_MAX = 1500;

const summaryInFlight = new Map<string, Promise<UserSummary | null>>();
const summaryLastUsed = new Map<string, number>();
let summaryTouchSeq = 0;

// Profile cache metadata stays outside Svelte state: it is eviction/request
// bookkeeping, not UI state.
const profileLastUsed = new Map<string, number>();
const retainedProfileCounts = new Map<string, number>();
const profileInFlight = new Map<string, Promise<UserProfile | null>>();
const profileLoadQueue = new Set<string>();
let profileLoadFlushQueued = false;
let profileTouchSeq = 0;

function typingTimerKey(channelId: string, userId: string): string {
    return `${channelId}:${userId}`;
}
// Full live presence (not just online/offline). `presence_sync` is the
// authoritative snapshot on (re)connect; `presence_update` patches one user.

interface LivePresence {
    status: PresenceStatus;
    status_message: string | null;
    nickname: string | null;
}

export const state = $state({
    byId: new SvelteMap<string, UserSummary>(),
    // Lazy profiles (incl. banner_media). Only fetched when needed.
    profiles: new SvelteMap<string, UserProfile>(),
    // Ephemeral presence: full live state per user.
    presence: new SvelteMap<string, LivePresence>(),
    // channelId → userId → expiresAt (ms epoch).
    typing: new SvelteMap<string, SvelteMap<string, number>>(),
    joinNotice: null as { id: number; userId: string } | null,
    // Ban state mirrored from UserSummary.banned and patched after ban/unban.
    // Kept as a set for quick membership checks across sparse summary eviction.
    // Only reset on logout/full reset — not per list load.
    bannedIds: new SvelteSet<string>(),
    list: {
        items: [] as UserSummary[],
        hasMore: false,
        cursor: null as KeysetCursor | null,
        hasMorePrevious: false,
        hasMoreNext: false,
        cursorStart: null as KeysetCursor | null,
        cursorEnd: null as KeysetCursor | null,
        loading: false,
        loaded: false,
        // Guards against concurrent list navigation.
        loadGeneration: 0
    }
});

function touchSummary(id: string): void {
    summaryLastUsed.set(id, (summaryTouchSeq += 1));
}

function summaryIsProtected(id: string): boolean {
    return (
        state.list.items.some((user) => user.id === id) ||
        state.presence.has(id) ||
        state.profiles.has(id) ||
        retainedProfileCounts.has(id) ||
        state.joinNotice?.userId === id
    );
}

function evictSummaries(): void {
    if (state.byId.size <= SUMMARY_CACHE_MAX) return;

    const candidates = [...state.byId.keys()]
        .filter((id) => !summaryIsProtected(id))
        .sort((a, b) => (summaryLastUsed.get(a) ?? 0) - (summaryLastUsed.get(b) ?? 0));

    for (const id of candidates) {
        if (state.byId.size <= SUMMARY_CACHE_TARGET) break;
        state.byId.delete(id);
        summaryLastUsed.delete(id);
    }
}

function touchProfile(id: string): void {
    profileLastUsed.set(id, (profileTouchSeq += 1));
}

function profileIsRetained(id: string): boolean {
    return (retainedProfileCounts.get(id) ?? 0) > 0;
}

function cacheProfile(profile: UserProfile): void {
    state.profiles.set(profile.id, profile);
    touchProfile(profile.id);
}

function invalidateProfile(id: string): void {
    state.profiles.delete(id);
    profileLastUsed.delete(id);
}

function evictProfiles(): void {
    if (state.profiles.size <= PROFILE_CACHE_MAX) {
        return;
    }

    const candidates = [...state.profiles.keys()]
        .filter((id) => !profileIsRetained(id))
        .sort((a, b) => (profileLastUsed.get(a) ?? 0) - (profileLastUsed.get(b) ?? 0));

    for (const id of candidates) {
        if (state.profiles.size <= PROFILE_CACHE_TARGET) {
            break;
        }
        invalidateProfile(id);
    }
}

function scheduleProfileLoad(id: string): void {
    if (!id || state.profiles.has(id) || profileInFlight.has(id)) {
        return;
    }

    profileLoadQueue.add(id);
    if (profileLoadFlushQueued) {
        return;
    }

    profileLoadFlushQueued = true;
    queueMicrotask(() => {
        profileLoadFlushQueued = false;
        const ids = [...profileLoadQueue];
        profileLoadQueue.clear();
        if (ids.length === 0) {
            return;
        }
        void ensureProfiles(ids).catch((err) => {
            console.error('falha ao carregar perfis visíveis:', err);
        });
    });
}

// Avatars retain profiles only while they are visible/near-visible. Released
// profiles stay warm until the cache crosses PROFILE_CACHE_MAX.
export function retainProfile(id: string): void {
    if (!id) {
        return;
    }

    retainedProfileCounts.set(id, (retainedProfileCounts.get(id) ?? 0) + 1);
    touchProfile(id);

    if (!state.profiles.has(id)) {
        scheduleProfileLoad(id);
    }
}

export function releaseProfile(id: string): void {
    const count = retainedProfileCounts.get(id) ?? 0;
    if (count <= 1) {
        retainedProfileCounts.delete(id);
    } else {
        retainedProfileCounts.set(id, count - 1);
    }
    evictProfiles();
}

// ── sparse summaries + paged member directory ────────────

function cursorFor(user: UserSummary | undefined): KeysetCursor | null {
    return user ? { since: user.created_at, last_id: user.id } : null;
}

function publishUserWindow(items: UserSummary[], hasPrev: boolean, hasNext: boolean): void {
    const deduped = [...new Map(items.map((user) => [user.id, state.byId.get(user.id) ?? user])).values()];
    state.list.items = deduped.slice(0, USER_LIST_MAX);
    state.list.hasMorePrevious = hasPrev;
    state.list.hasMoreNext = hasNext;
    state.list.hasMore = hasNext;
    state.list.cursorStart = cursorFor(state.list.items[0]);
    state.list.cursorEnd = cursorFor(state.list.items.at(-1));
    state.list.cursor = state.list.cursorEnd;
    for (const user of state.list.items) touchSummary(user.id);
    evictSummaries();
}

function appendJoinedUserToVisibleWindow(user: UserSummary): void {
    if (!state.list.loaded || state.list.hasMoreNext) return;
    if (state.list.items.some((item) => item.id === user.id)) return;

    let items = [...state.list.items, user].sort((a, b) => {
        const created = a.created_at.localeCompare(b.created_at);
        return created !== 0 ? created : a.id.localeCompare(b.id);
    });
    let hasPrev = state.list.hasMorePrevious;
    if (items.length > USER_LIST_MAX) {
        items = items.slice(items.length - USER_LIST_MAX);
        hasPrev = true;
    }
    publishUserWindow(items, hasPrev, false);
}

function ingestSummaries(summaries: UserSummary[]): void {
    syncSummaries(summaries);
}

export async function ensureSummaries(ids: string[]): Promise<UserSummary[]> {
    const unique = [...new Set(ids)].filter(Boolean);
    const waits = new Set<Promise<UserSummary | null>>();
    const missing: string[] = [];

    for (const id of unique) {
        if (state.byId.has(id)) {
            touchSummary(id);
            continue;
        }
        const pending = summaryInFlight.get(id);
        if (pending) waits.add(pending);
        else missing.push(id);
    }

    for (let i = 0; i < missing.length; i += 1000) {
        const chunk = missing.slice(i, i + 1000);
        const epoch = currentSessionEpoch();
        const batch = api.users.summaryBatch(chunk).then((summaries) => {
            if (!isCurrentSessionEpoch(epoch)) throw new Error('stale session');
            ingestSummaries(summaries);
            return summaries;
        });

        for (const id of chunk) {
            const request = batch
                .then((summaries) => summaries.find((summary) => summary.id === id) ?? null)
                .finally(() => {
                    if (summaryInFlight.get(id) === request) summaryInFlight.delete(id);
                });
            summaryInFlight.set(id, request);
            waits.add(request);
        }

        // Avoid a burst of many 1000-id requests on very large presence_sync
        // snapshots. Each page is ingested before requesting the next.
        try {
            await batch;
        } catch (error) {
            await Promise.allSettled([...waits]);
            throw error;
        }
    }

    if (waits.size) await Promise.all(waits);
    evictSummaries();
    return unique
        .map((id) => state.byId.get(id) ?? null)
        .filter((user): user is UserSummary => user !== null);
}

export async function ensureSummary(id: string): Promise<UserSummary | null> {
    return (await ensureSummaries([id]))[0] ?? null;
}

export async function refreshSummaries(ids: string[]): Promise<UserSummary[]> {
    const unique = [...new Set(ids)].filter(Boolean);
    const refreshed: UserSummary[] = [];

    for (let i = 0; i < unique.length; i += 1000) {
        const chunk = unique.slice(i, i + 1000);
        const epoch = currentSessionEpoch();
        const summaries = await api.users.summaryBatch(chunk);
        if (!isCurrentSessionEpoch(epoch)) throw new Error('stale session');
        syncSummaries(summaries);
        refreshed.push(...summaries);
    }

    evictSummaries();
    return refreshed;
}

export async function loadList(): Promise<void> {
    const gen = ++state.list.loadGeneration;
    state.list.loading = true;
    try {
        const res = await api.users.list({ order: 'asc' });
        if (state.list.loadGeneration !== gen) return;
        ingestSummaries(res.users);
        publishUserWindow(res.users, false, res.has_more);
        state.list.loaded = true;
    } finally {
        if (state.list.loadGeneration === gen) state.list.loading = false;
    }
}

export async function loadMore(): Promise<void> {
    if (state.list.loading) return;
    const cursor = state.list.cursorEnd;
    if (!cursor) {
        if (state.list.items.length === 0) await loadList();
        return;
    }
    if (!state.list.hasMoreNext) return;

    const gen = ++state.list.loadGeneration;
    state.list.loading = true;
    try {
        const res = await api.users.list({
            since: cursor.since,
            last_id: cursor.last_id,
            order: 'asc'
        });
        if (state.list.loadGeneration !== gen) return;
        ingestSummaries(res.users);

        let merged = [...state.list.items, ...res.users];
        let trimmed = false;
        if (merged.length > USER_LIST_MAX) {
            merged = merged.slice(merged.length - USER_LIST_MAX);
            trimmed = true;
        }
        publishUserWindow(
            merged,
            state.list.hasMorePrevious || trimmed,
            res.has_more
        );
    } finally {
        if (state.list.loadGeneration === gen) state.list.loading = false;
    }
}

export async function loadPrevious(): Promise<void> {
    if (state.list.loading || !state.list.hasMorePrevious) return;
    const cursor = state.list.cursorStart;
    if (!cursor) return;

    const gen = ++state.list.loadGeneration;
    state.list.loading = true;
    try {
        const res = await api.users.list({
            since: cursor.since,
            last_id: cursor.last_id,
            order: 'desc'
        });
        if (state.list.loadGeneration !== gen) return;
        const page = [...res.users].reverse();
        ingestSummaries(page);

        let merged = [...page, ...state.list.items];
        let trimmed = false;
        if (merged.length > USER_LIST_MAX) {
            merged = merged.slice(0, USER_LIST_MAX);
            trimmed = true;
        }
        publishUserWindow(
            merged,
            res.has_more,
            state.list.hasMoreNext || trimmed
        );
    } finally {
        if (state.list.loadGeneration === gen) state.list.loading = false;
    }
}

// Seed the current user from the whoami response (richer than the /users
// list: includes avatar_blob, banner_media, status, settings). Called by the
// session store on load.

export function seedMe(me: {
    id: string;
    username: string;
    nickname: string | null;
    avatar_blob: string | null;
    avatar_format: string;
    status: 'away' | 'busy' | null;
    status_message: string | null;
    typing: string | null;
    status_updated_at: string | null;
    created_at: string;
    roles: { id: string; name: string; color: string | null }[];
}): void {
    const summary: UserSummary = {
        id: me.id,
        username: me.username,
        nickname: me.nickname,
        banned: false,
        status: me.status,
        status_message: me.status_message,
        typing: me.typing,
        status_updated_at: me.status_updated_at,
        created_at: me.created_at,
        roles: me.roles
    };
    syncSummary(summary);
}

// ── profiles (lazy + bounded hot cache) ──────────────────

export function getProfile(id: string): UserProfile | null {
    return state.profiles.get(id) ?? null;
}
// Summary built from a fetched profile (used to seed `byId` so byId-based
// renderers pick up the user's name/roles immediately).

function summaryFromProfile(p: UserProfile): UserSummary {
    return {
        id: p.id,
        username: p.username,
        nickname: p.nickname,
        banned: state.byId.get(p.id)?.banned ?? false,
        status: p.status,
        status_message: p.status_message,
        typing: p.typing,
        status_updated_at: p.status_updated_at,
        created_at: p.created_at,
        roles: p.roles
    };
}

function syncSummaries(summaries: UserSummary[]): void {
    if (summaries.length === 0) return;

    const updates = new Map<string, UserSummary>();
    for (const summary of summaries) {
        state.byId.set(summary.id, summary);
        if (summary.banned) state.bannedIds.add(summary.id);
        else state.bannedIds.delete(summary.id);
        touchSummary(summary.id);
        updates.set(summary.id, summary);
    }

    if (state.list.items.some((user) => updates.has(user.id))) {
        state.list.items = state.list.items.map((user) => updates.get(user.id) ?? user);
    }
}

function syncSummary(summary: UserSummary): void {
    syncSummaries([summary]);
}

export function cacheSummaries(summaries: UserSummary[]): void {
    syncSummaries(summaries);
    evictSummaries();
}

export function setPersistedStatus(userId: string, status: 'away' | 'busy' | null): void {
    const summary = state.byId.get(userId);
    if (summary) syncSummary({ ...summary, status, status_updated_at: new Date().toISOString() });
    const presence = state.presence.get(userId);
    if (presence) state.presence.set(userId, { ...presence, status: status ?? 'online' });
}

function trackProfileRequest(id: string, request: Promise<UserProfile | null>): void {
    profileInFlight.set(id, request);
    request.then(
        () => {
            if (profileInFlight.get(id) === request) {
                profileInFlight.delete(id);
            }
        },
        () => {
            if (profileInFlight.get(id) === request) {
                profileInFlight.delete(id);
            }
        }
    );
}

export async function ensureProfile(id: string): Promise<UserProfile> {
    const cached = state.profiles.get(id);
    if (cached) {
        touchProfile(id);
        return cached;
    }

    const pending = profileInFlight.get(id);
    if (pending) {
        const profile = await pending;
        if (profile) {
            touchProfile(id);
            return profile;
        }
    }

    const epoch = currentSessionEpoch();
    const request = api.users.profile(id).then((profile) => {
        if (!isCurrentSessionEpoch(epoch)) {
            throw new Error('stale session');
        }
        cacheProfile(profile);
        // Seed the summary even when the user is unknown — a new author / a
        // profile fetched directly must still appear in the summaries map.
        syncSummary(summaryFromProfile(profile));
        evictProfiles();
        return profile;
    });

    trackProfileRequest(id, request);
    return request;
}

export async function ensureProfiles(ids: string[]): Promise<UserProfile[]> {
    const unique = [...new Set(ids)].filter((id) => id !== '');
    for (const id of unique) {
        touchProfile(id);
    }

    const waits = new Set<Promise<UserProfile | null>>();
    for (const id of unique) {
        const pending = profileInFlight.get(id);
        if (pending) {
            waits.add(pending);
        }
    }

    const missing = unique.filter((id) => !state.profiles.has(id) && !profileInFlight.has(id));

    // Chunk ≤ 50 (server limit). A single promise is registered per id so a
    // simultaneous ensureProfile/ensureProfiles call reuses the same request.
    for (let i = 0; i < missing.length; i += 50) {
        const chunk = missing.slice(i, i + 50);
        const epoch = currentSessionEpoch();

        const batch = api.users.profileBatch(chunk).then((res) => {
            if (!isCurrentSessionEpoch(epoch)) {
                throw new Error('stale session');
            }
            const summaries: UserSummary[] = [];
            for (const p of res.profiles) {
                cacheProfile(p);
                summaries.push(summaryFromProfile(p));
            }
            syncSummaries(summaries);
        });

        for (const id of chunk) {
            const request = batch.then(() => state.profiles.get(id) ?? null);
            trackProfileRequest(id, request);
            waits.add(request);
        }

        await batch;
    }

    if (waits.size > 0) {
        await Promise.all(waits);
    }

    evictProfiles();
    return unique
        .map((id) => state.profiles.get(id) ?? null)
        .filter((profile): profile is UserProfile => profile !== null);
}

// ── presence ────────────────────────────────────────────

export function presenceStatus(id: string): PresenceStatus | null {
    return state.presence.get(id)?.status ?? null;
}
// Effective status for display. An *unknown* presence (user not in the sync
// snapshot) is **not** treated as online — fall back to the persisted
// summary status, else 'offline'.

export function effectiveStatus(id: string): 'online' | 'offline' | 'away' | 'busy' {
    const pres = state.presence.get(id);
    if (pres) {
        return pres.status;
    }
    const summary = state.byId.get(id);
    return summary?.status ?? 'offline';
}
// Replaces the ephemeral presence snapshot with the given members. The
// snapshot is authoritative: users not listed are no longer online.

export function setPresence(
    members: {
        user_id: string;
        status: string;
        status_message: string | null;
        nickname?: string | null;
    }[]
): void {
    const next: SvelteMap<string, LivePresence> = new SvelteMap();
    for (const m of members) {
        next.set(m.user_id, {
            status: (m.status === 'offline' ? 'offline' : m.status) as PresenceStatus,
            status_message: m.status_message ?? null,
            nickname: m.nickname ?? null
        });
    }
    state.presence = next;
    evictSummaries();
}

// ── typing (TTL) ────────────────────────────────────────

function clearTypingTimer(channelId: string, userId: string): void {
    const key = typingTimerKey(channelId, userId);
    const timer = typingTimers.get(key);
    if (timer) {
        clearTimeout(timer);
        typingTimers.delete(key);
    }
}

function removeTypingEntry(channelId: string, userId: string): void {
    clearTypingTimer(channelId, userId);
    const map = state.typing.get(channelId);
    if (!map) return;
    map.delete(userId);
    if (map.size === 0) {
        state.typing.delete(channelId);
    }
}

function clearTypingUser(userId: string, exceptChannelId?: string): void {
    const channels: string[] = [];
    for (const [channelId, map] of state.typing) {
        if (channelId !== exceptChannelId && map.has(userId)) {
            channels.push(channelId);
        }
    }
    for (const channelId of channels) {
        removeTypingEntry(channelId, userId);
    }
}

function scheduleTypingExpiry(channelId: string, userId: string, delay = TYPING_TTL): void {
    clearTypingTimer(channelId, userId);
    const key = typingTimerKey(channelId, userId);
    const timer = setTimeout(() => {
        const map = state.typing.get(channelId);
        const expiresAt = map?.get(userId) ?? 0;
        // A newer typing event may have extended the TTL while this callback
        // was already queued. Only remove the entry if it really expired.
        if (expiresAt > Date.now()) {
            scheduleTypingExpiry(channelId, userId, expiresAt - Date.now());
            return;
        }
        removeTypingEntry(channelId, userId);
    }, Math.max(0, delay));
    typingTimers.set(key, timer);
}

export function pruneTyping(now = Date.now()): void {
    const expired: Array<[channelId: string, userId: string]> = [];
    for (const [channelId, map] of state.typing) {
        for (const [userId, expiresAt] of map) {
            if (expiresAt <= now) {
                expired.push([channelId, userId]);
            }
        }
    }
    for (const [channelId, userId] of expired) {
        removeTypingEntry(channelId, userId);
    }
}

export function isTyping(channelId: string, userId: string): boolean {
    pruneTyping();
    return state.typing.get(channelId)?.has(userId) ?? false;
}

export function typingUsers(channelId: string): string[] {
    pruneTyping();
    const map = state.typing.get(channelId);
    return map ? Array.from(map.keys()) : [];
}

export function setTyping(channelId: string, userId: string, typing: boolean): void {
    if (!typing) {
        removeTypingEntry(channelId, userId);
        return;
    }
    // A user should only have one active typing channel. This also prevents a
    // stale indicator if the user switches channels without an explicit stop.
    clearTypingUser(userId, channelId);
    let map = state.typing.get(channelId);
    if (!map) {
        map = new SvelteMap<string, number>();
        state.typing.set(channelId, map);
    }
    map.set(userId, Date.now() + TYPING_TTL);
    scheduleTypingExpiry(channelId, userId);
}

// ── WS event handlers ───────────────────────────────────

export function handleUserJoin(userId: string): void {
    state.joinNotice = { id: (joinNoticeSerial += 1), userId };

    void Promise.allSettled([ensureSummary(userId), ensureProfile(userId)]).then(([summaryResult]) => {
        const summary =
            summaryResult.status === 'fulfilled'
                ? summaryResult.value
                : state.byId.get(userId) ?? null;
        if (summary) appendJoinedUserToVisibleWindow(summary);
    });
}

export function consumeJoinNotice(
    expectedId?: number
): { id: number; userId: string } | null {
    const notice = state.joinNotice;
    if (!notice) return null;
    if (expectedId !== undefined && notice.id !== expectedId) return null;
    if (notice.id <= consumedJoinNoticeSerial) return null;

    consumedJoinNoticeSerial = notice.id;
    state.joinNotice = null;
    return notice;
}
// presence_sync is the authoritative snapshot on (re)connect: replace the
// whole presence map (users absent from the snapshot are no longer online).

export function handlePresenceSync(
    members: {
        user_id: string;
        status: PresenceStatus;
        status_message: string | null;
        user_voice?: string[];
    }[]
): void {
    setPresence(members);
    void ensureSummaries(members.map((member) => member.user_id)).catch(() => {});
}
// presence_update: patch one user's live presence and summary (nickname /
// status_message are surfaced in the summary).

export function handlePresenceUpdate(ev: {
    user_id: string;
    status: PresenceStatus;
    status_message: string | null;
    typing?: string | null;
    nickname?: string | null;
}): void {
    const { user_id, status, status_message, nickname } = ev;
    const summary = state.byId.get(user_id);
    if (summary) {
        const next: UserSummary = { ...summary };
        if ('status_message' in ev) {
            next.status_message = status_message ?? null;
        }
        if ('nickname' in ev) {
            next.nickname = nickname ?? null;
        }
        if ('typing' in ev) {
            next.typing = ev.typing ?? null;
        }
        syncSummary(next);
    }
    // The backend exposes `typing` as the channel id while typing and null
    // when typing stops. Apply it to the ephemeral typing map as well.
    if ('typing' in ev) {
        if (ev.typing) {
            setTyping(ev.typing, user_id, true);
        } else {
            clearTypingUser(user_id);
        }
    }
    state.presence.set(user_id, {
        status,
        status_message: status_message ?? null,
        nickname: nickname ?? null
    });
}

export function handleAvatarUpdate(userId: string): void {
    // Invalidate the cached avatar. Re-fetch immediately only when something
    // on screen is currently retaining this profile.
    invalidateProfile(userId);
    if (profileIsRetained(userId)) {
        scheduleProfileLoad(userId);
    }
}

export function handleRoleAdd(userId: string): void {
    invalidateProfile(userId);
    void refreshSummaries([userId]).catch(() => {});
    if (profileIsRetained(userId)) scheduleProfileLoad(userId);
}

export function handleRoleRemove(userId: string): void {
    invalidateProfile(userId);
    void refreshSummaries([userId]).catch(() => {});
    if (profileIsRetained(userId)) scheduleProfileLoad(userId);
}
// Avatar objectURL helper (base64 → objectURL, cached).

export function avatarUrl(user: UserProfile): string {
    if (!user.avatar_blob) {
        return '';
    }
    return blobToUrl(user.avatar_blob, user.avatar_format);
}
// Full reset (logout / 401 / account switch) — clears every user-specific
// cache so the previous account leaves zero residue.

export function reset(): void {
    for (const timer of typingTimers.values()) {
        clearTimeout(timer);
    }
    typingTimers.clear();
    state.byId.clear();
    state.profiles.clear();
    profileLastUsed.clear();
    retainedProfileCounts.clear();
    profileInFlight.clear();
    summaryInFlight.clear();
    summaryLastUsed.clear();
    summaryTouchSeq = 0;
    profileLoadQueue.clear();
    profileLoadFlushQueued = false;
    profileTouchSeq = 0;
    state.presence.clear();
    state.typing.clear();
    state.joinNotice = null;
    joinNoticeSerial = 0;
    consumedJoinNoticeSerial = 0;
    state.bannedIds.clear();
    const nextGeneration = state.list.loadGeneration + 1;
    state.list = {
        items: [],
        hasMore: false,
        cursor: null,
        hasMorePrevious: false,
        hasMoreNext: false,
        cursorStart: null,
        cursorEnd: null,
        loading: false,
        loaded: false,
        loadGeneration: nextGeneration
    };
}
// Ban / unban. The mutation does not return a fresh UserSummary, so patch
// both the summary and quick lookup set after the server confirms success.

export async function setBanState(userId: string, ban: boolean): Promise<void> {
    await api.users.ban({ user_id: userId, ban_state: ban });
    if (ban) state.bannedIds.add(userId);
    else state.bannedIds.delete(userId);
    const summary = state.byId.get(userId);
    if (summary) syncSummary({ ...summary, banned: ban });
}

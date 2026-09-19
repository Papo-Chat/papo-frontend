// Users store: summaries (byId), lazy profiles (byId), ephemeral presence,
// typing (TTL), and a keyset list.

import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api';
import { nextCursor } from '../utils/keyset';
import { blobToUrl } from '../utils/media';
import type {
	UserSummary,
	UserProfile,
	UserList,
	KeysetCursor,
	PresenceStatus,
} from '../types';

const TYPING_TTL = 5000; // ms

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
	list: {
		items: [] as UserSummary[],
		hasMore: false,
		cursor: null as KeysetCursor | null,
		loading: false,
		// Guards against concurrent load/loadMore (P1.11).
		loadGeneration: 0,
	},
});

// ── list (keyset, 100/page) ─────────────────────────────

async function listLoad(q?: { since?: string; last_id?: string }): Promise<void> {
	const gen = (state.list.loadGeneration += 1);
	state.list.loading = true;
	try {
		const res = await api.users.list(q);
		// Discard if a newer load/loadMore started in the meantime (P1.11).
		if (state.list.loadGeneration !== gen) {
			return;
		}
		if (q) {
			// loadMore: append, deduping by user id.
			const seen = new Set(state.list.items.map((u) => u.id));
			const fresh = res.users.filter((u) => !seen.has(u.id));
			state.list.items = [...state.list.items, ...fresh];
		} else {
			// load: replace.
			state.list.items = res.users;
		}
		state.list.hasMore = res.has_more;
		state.list.cursor = nextCursor(res.users) ?? null;
		for (const u of res.users) {
			state.byId.set(u.id, u);
		}
	} finally {
		if (state.list.loadGeneration === gen) {
			state.list.loading = false;
		}
	}
}

export function loadList(): Promise<void> {
	return listLoad();
}

export function loadMore(): void {
	// Guard: no in-flight page + a cursor to continue from (P1.11).
	if (state.list.loading || !state.list.cursor) {
		return;
	}
	listLoad({
		since: state.list.cursor.since,
		last_id: state.list.cursor.last_id,
	});
}

// Seed the current user from the whoami response (richer than the /users
// list: includes avatar_blob, banner_media, status, settings). Called by the
// session store on load.
export function seedMe(
	me: {
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
	}
): void {
	const summary: UserSummary = {
		id: me.id,
		username: me.username,
		nickname: me.nickname,
		status: me.status,
		status_message: me.status_message,
		typing: me.typing,
		status_updated_at: me.status_updated_at,
		created_at: me.created_at,
		roles: me.roles,
	};
	state.byId.set(me.id, summary);
}

// ── profiles (lazy) ─────────────────────────────────────

export function getProfile(id: string): UserProfile | null {
	return state.profiles.get(id) ?? null;
}

export async function ensureProfile(id: string): Promise<UserProfile> {
	const cached = state.profiles.get(id);
	if (cached) {
		return cached;
	}
	const profile = await api.users.profile(id);
	state.profiles.set(id, profile);
	// Seed the summary even when the user is unknown — a new author / a
	// profile fetched directly must still appear in the summaries map.
	const summary: UserSummary = {
		id: profile.id,
		username: profile.username,
		nickname: profile.nickname,
		status: profile.status,
		status_message: profile.status_message,
		typing: profile.typing,
		status_updated_at: profile.status_updated_at,
		created_at: profile.created_at,
		roles: profile.roles,
	};
	state.byId.set(id, summary);
	return profile;
}

export async function ensureProfiles(ids: string[]): Promise<UserProfile[]> {
	const out: UserProfile[] = [];
	// Chunk ≤ 50.
	for (let i = 0; i < ids.length; i += 50) {
		const chunk = ids.slice(i, i + 50);
		const res = await api.users.profileBatch(chunk);
		for (const p of res.profiles) {
			state.profiles.set(p.id, p);
			out.push(p);
		}
	}
	return out;
}

// ── presence ────────────────────────────────────────────

export function presenceStatus(id: string): PresenceStatus | null {
	return state.presence.get(id)?.status ?? null;
}

// Effective status for display. An *unknown* presence (user not in the sync
// snapshot) is **not** treated as online — fall back to the persisted
// summary status, else 'offline'.
export function effectiveStatus(
	id: string
): 'online' | 'offline' | 'away' | 'busy' {
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
	members: { user_id: string; status: string; status_message: string | null; nickname?: string | null }[]
): void {
	const next: SvelteMap<string, LivePresence> = new SvelteMap();
	for (const m of members) {
		next.set(m.user_id, {
			status: (m.status === 'offline' ? 'offline' : m.status) as PresenceStatus,
			status_message: m.status_message ?? null,
			nickname: m.nickname ?? null,
		});
	}
	state.presence = next;
}

// ── typing (TTL) ────────────────────────────────────────

export function pruneTyping(now = Date.now()): void {
	// Remove all expired typing entries.
	const toDelete: string[] = [];
	for (const [channelId, map] of state.typing) {
		const ids = map.keys();
		for (const userId of ids) {
			const expiresAt = map.get(userId) ?? 0;
			if (expiresAt <= now) {
				toDelete.push(userId);
			}
		}
	}
	for (const userId of toDelete) {
		// find the channel containing it
		for (const [channelId, map] of state.typing) {
			if (map.has(userId)) {
				map.delete(userId);
				break;
			}
		}
	}
}

export function isTyping(channelId: string, userId: string): boolean {
	pruneTyping();
	const map = state.typing.get(channelId);
	return map ? map.has(userId) : false;
}

export function typingUsers(channelId: string): string[] {
	pruneTyping();
	const map = state.typing.get(channelId);
	if (!map) {
		return [];
	}
	return Array.from(map.keys());
}

export function setTyping(channelId: string, userId: string, typing: boolean): void {
	let map = state.typing.get(channelId);
	if (!map) {
		map = new SvelteMap<string, number>();
	}
	if (typing) {
		map.set(userId, Date.now() + TYPING_TTL);
	} else {
		map.delete(userId);
	}
	// Replace with a new map so the outer typing map sees a change.
	state.typing.set(channelId, map);
}

// ── WS event handlers ───────────────────────────────────

export function handleUserJoin(userId: string): void {
	// Lazy-fetch the profile (resolves author name/roles).
	ensureProfile(userId);
}

// presence_sync is the authoritative snapshot on (re)connect: replace the
// whole presence map (users absent from the snapshot are no longer online).
export function handlePresenceSync(
	members: {
		user_id: string;
		status: PresenceStatus;
		status_message: string | null;
	}[]
): void {
	setPresence(members);
}

// presence_update: patch one user's live presence and summary (nickname /
// status_message are surfaced in the summary).
export function handlePresenceUpdate(
	ev: {
		user_id: string;
		status: PresenceStatus;
		status_message: string | null;
		typing?: string | null;
		nickname?: string | null;
	}
): void {
	const { user_id, status, status_message, nickname } = ev;
	const summary = state.byId.get(user_id);
	if (summary) {
		const next: UserSummary = { ...summary };
		if (status_message != null) {
			next.status_message = status_message;
		}
		if (nickname != null) {
			next.nickname = nickname;
		}
		state.byId.set(user_id, next);
	}
	state.presence.set(user_id, {
		status,
		status_message: status_message ?? null,
		nickname: nickname ?? null,
	});
}

export function handleAvatarUpdate(userId: string): void {
	// Invalidate the profile cache entry (refetch if cached).
	if (state.profiles.has(userId)) {
		state.profiles.delete(userId);
		// Re-fetch if it was cached.
		ensureProfile(userId);
	}
}

export function handleRoleAdd(userId: string, roleId: string): void {
	// Payload is only {user_id, role_id} (no name/color) → invalidate the
	// cached profile (if any) so it refetches with the new roles.
	if (state.profiles.has(userId)) {
		state.profiles.delete(userId);
	}
	void ensureProfile(userId);
}

export function handleRoleRemove(userId: string, roleId: string): void {
	if (state.profiles.has(userId)) {
		state.profiles.delete(userId);
	}
	void ensureProfile(userId);
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
	state.byId.clear();
	state.profiles.clear();
	state.presence.clear();
	state.typing.clear();
	state.list = {
		items: [],
		hasMore: false,
		cursor: null,
		loading: false,
		loadGeneration: 0,
	};
}

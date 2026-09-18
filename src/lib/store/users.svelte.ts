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
} from '../types';

const TYPING_TTL = 5000; // ms

export const state = $state({
	byId: new SvelteMap<string, UserSummary>(),
	// Lazy profiles (incl. banner_media). Only fetched when needed.
	profiles: new SvelteMap<string, UserProfile>(),
	// Ephemeral presence: online/offline.
	presence: new SvelteMap<string, 'online' | 'offline'>(),
	// channelId → userId → expiresAt (ms epoch).
	typing: new SvelteMap<string, SvelteMap<string, number>>(),
	list: {
		items: [] as UserSummary[],
		hasMore: false,
		cursor: null as KeysetCursor | null,
		loading: false,
	},
});

// ── list (keyset, 100/page) ─────────────────────────────

async function listLoad(q?: { since?: string; last_id?: string }): Promise<void> {
	state.list.loading = true;
	try {
		const res = await api.users.list(q);
		if (q) {
			// loadMore: append
			state.list.items = [...state.list.items, ...res.users];
		} else {
			// load: replace
			state.list.items = res.users;
		}
		state.list.hasMore = res.has_more;
		state.list.cursor = nextCursor(res.users) ?? null;
		for (const u of res.users) {
			state.byId.set(u.id, u);
		}
	} finally {
		state.list.loading = false;
	}
}

export function loadList(): Promise<void> {
	return listLoad();
}

export function loadMore(): void {
	if (!state.list.cursor) {
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
	// Also update the summary (profiles have richer fields).
	if (state.byId.has(id)) {
		const summary = state.byId.get(id) ?? {
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
	}
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

export function presenceStatus(id: string): 'online' | 'offline' | null {
	return state.presence.get(id) ?? null;
}

export function effectiveStatus(
	id: string
): 'online' | 'offline' | 'away' | 'busy' {
	const pres = state.presence.get(id) ?? null;
	const summary = state.byId.get(id);
	const status = summary?.status ?? null;
	if (pres === 'offline') {
		return status ?? 'offline';
	}
	// online (or unknown → treat as online)
	return status ?? 'online';
}

export function setPresence(members: { user_id: string; status: string }[]): void {
	// Reset ephemeral presence: listed = online, rest = offline.
	for (const m of members) {
		state.presence.set(m.user_id, m.status === 'offline' ? 'offline' : 'online');
	}
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

export function handlePresenceSync(members: {
	user_id: string;
	status: string;
	status_message: string | null;
}[]): void {
	setPresence(members);
}

export function handlePresenceUpdate({
	user_id,
	status,
	status_message,
}: {
	user_id: string;
	status: string;
	status_message?: string | null;
}): void {
	const summary = state.byId.get(user_id);
	if (summary) {
		const next: UserSummary = { ...summary };
		if (status_message != null) {
			next.status_message = status_message;
		}
		state.byId.set(user_id, next);
	}
	state.presence.set(user_id, status === 'offline' ? 'offline' : 'online');
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
	// Payload is only {user_id, role_id} (no name/color) → refetch profile.
	ensureProfile(userId);
}

export function handleRoleRemove(userId: string, roleId: string): void {
	ensureProfile(userId);
}

// Avatar objectURL helper (base64 → objectURL, cached).
export function avatarUrl(user: UserProfile): string {
	if (!user.avatar_blob) {
		return '';
	}
	return blobToUrl(user.avatar_blob, user.avatar_format);
}

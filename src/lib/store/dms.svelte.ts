import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api';
import type { DirectConversation, WsDmUpdate } from '../types';
import { currentSessionEpoch, isCurrentSessionEpoch } from '../utils/session-epoch';
import * as usersStore from './users.svelte';
import { evict as evictMessages } from './messages.svelte';

export const state = $state({
	byId: new SvelteMap<string, DirectConversation>(),
	ordered: [] as string[],
	openDmId: null as string | null,
	loaded: false,
	loading: false
});

function sortKey(dm: DirectConversation): string {
	return dm.last_message?.created_at ?? dm.created_at;
}

function rebuildOrdered(): void {
	state.ordered = [...state.byId.values()]
		.sort((a, b) => {
			const byDate = sortKey(b).localeCompare(sortKey(a));
			return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
		})
		.map((dm) => dm.id);
}

function cacheUser(dm: DirectConversation): void {
	usersStore.cacheSummaries([dm.user]);
}

export function upsert(dm: DirectConversation): void {
	cacheUser(dm);
	state.byId.set(dm.id, {
		...dm,
		unread_count: state.openDmId === dm.id ? 0 : dm.unread_count
	});
	rebuildOrdered();
}

export async function load(): Promise<void> {
	if (state.loading) return;
	const epoch = currentSessionEpoch();
	state.loading = true;
	try {
		const res = await api.dms.list();
		if (!isCurrentSessionEpoch(epoch)) return;

		const byId = new SvelteMap<string, DirectConversation>();
		for (const dm of res.dms) {
			cacheUser(dm);
			byId.set(dm.id, {
				...dm,
				unread_count: state.openDmId === dm.id ? 0 : dm.unread_count
			});
		}
		state.byId = byId;
		rebuildOrdered();
		state.loaded = true;
	} finally {
		state.loading = false;
	}
}

export async function ensureLoaded(): Promise<void> {
	if (state.loaded) return;
	await load();
}

export function get(id: string | null | undefined): DirectConversation | null {
	return id ? state.byId.get(id) ?? null : null;
}

export function findByUser(userId: string): DirectConversation | null {
	for (const dm of state.byId.values()) {
		if (dm.user.id === userId) return dm;
	}
	return null;
}

export async function openWithUser(userId: string): Promise<DirectConversation> {
	const epoch = currentSessionEpoch();
	const dm = await api.dms.open(userId);
	if (!isCurrentSessionEpoch(epoch)) throw new Error('stale session');
	state.openDmId = dm.id;
	upsert({ ...dm, unread_count: 0 });
	return state.byId.get(dm.id) ?? dm;
}

// Deep links may point to a valid conversation hidden from the rail. GET finds
// it, then POST by participant makes opening the route explicitly re-show only
// the current user's rail entry.
export async function openById(id: string): Promise<DirectConversation> {
	const cached = state.byId.get(id);
	if (cached) {
		state.openDmId = cached.id;
		return cached;
	}

	const initial = await api.dms.get(id);
	// GET also resolves hidden deep-links, while POST is the operation that
	// explicitly re-shows the conversation only for the current user.
	return openWithUser(initial.user.id);
}

export function setOpen(id: string | null): void {
	state.openDmId = id;
	if (!id) return;
	const dm = state.byId.get(id);
	if (dm && dm.unread_count !== 0) {
		state.byId.set(id, { ...dm, unread_count: 0 });
	}
}

export function markReadLocal(id: string, messageId: string, createdAt: string): void {
	const dm = state.byId.get(id);
	if (!dm) return;
	state.byId.set(id, {
		...dm,
		last_read_message: messageId,
		last_read_at: createdAt,
		unread_count: 0
	});
}

export function drop(id: string): void {
	state.byId.delete(id);
	state.ordered = state.ordered.filter((dmId) => dmId !== id);
	if (state.openDmId === id) state.openDmId = null;
	evictMessages(id);
}

export function dropByUser(userId: string): void {
	const dm = findByUser(userId);
	if (dm) drop(dm.id);
}

export async function hide(id: string): Promise<void> {
	await api.dms.hide(id);
	drop(id);
}

export function handleUpdate(event: WsDmUpdate): void {
	upsert(event.dm);
}

export function reset(): void {
	state.byId.clear();
	state.ordered = [];
	state.openDmId = null;
	state.loaded = false;
	state.loading = false;
}

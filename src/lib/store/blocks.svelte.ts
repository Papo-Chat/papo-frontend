import { api } from '../api';
import type { UserSummary } from '../types';
import { currentSessionEpoch, isCurrentSessionEpoch } from '../utils/session-epoch';
import * as usersStore from './users.svelte';
import * as dmsStore from './dms.svelte';

export const state = $state({
	users: [] as UserSummary[],
	blockedIds: [] as string[],
	loaded: false,
	loading: false
});

export function isBlocked(userId: string): boolean {
	return state.blockedIds.includes(userId);
}

export async function load(): Promise<void> {
	if (state.loading) return;
	const epoch = currentSessionEpoch();
	state.loading = true;
	try {
		const res = await api.users.blocks();
		if (!isCurrentSessionEpoch(epoch)) return;
		state.users = res.users;
		state.blockedIds = res.users.map((user) => user.id);
		usersStore.cacheSummaries(res.users);
		state.loaded = true;
	} finally {
		state.loading = false;
	}
}

export async function block(user: UserSummary): Promise<void> {
	if (isBlocked(user.id)) return;
	await api.users.block(user.id);
	state.users = [user, ...state.users.filter((item) => item.id !== user.id)];
	state.blockedIds = [user.id, ...state.blockedIds.filter((id) => id !== user.id)];
	dmsStore.dropByUser(user.id);
}

export async function unblock(userId: string): Promise<void> {
	await api.users.unblock(userId);
	state.users = state.users.filter((user) => user.id !== userId);
	state.blockedIds = state.blockedIds.filter((id) => id !== userId);
}

export function reset(): void {
	state.users = [];
	state.blockedIds = [];
	state.loaded = false;
	state.loading = false;
}

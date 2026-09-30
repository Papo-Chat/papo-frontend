// Roles store: the role list (byId + list) plus role assignment actions.

import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api';
import { currentSessionEpoch, isCurrentSessionEpoch } from '../utils/session-epoch';
import type { Role, RolePermissions } from '../types';
import {
	myRolePermissions,
	channelAccess,
	can,
	type RoleContext,
	type ChannelAccess
} from '../utils/permissions';

export const state = $state({
	byId: new SvelteMap<string, Role>(),
	list: [] as Role[],
	loaded: false
});

export async function load(): Promise<void> {
	const epoch = currentSessionEpoch();
	const roles = await api.roles.list();
	if (!isCurrentSessionEpoch(epoch)) {
		throw new Error('stale session');
	}
	const map = new SvelteMap<string, Role>();
	for (const r of roles) {
		map.set(r.id, r);
	}
	state.byId = map;
	state.list = roles;
	state.loaded = true;
}

export async function create(req: {
	name: string;
	color: string | null;
	permissions: RolePermissions;
}): Promise<Role> {
	const epoch = currentSessionEpoch();
	const role = await api.roles.create(req);
	if (!isCurrentSessionEpoch(epoch)) {
		throw new Error('stale session');
	}
	state.byId.set(role.id, role);
	state.list = [...state.list, role];
	return role;
}

export async function update(
	id: string,
	req: { name: string; color: string | null; permissions: RolePermissions }
): Promise<Role> {
	const epoch = currentSessionEpoch();
	const role = await api.roles.update(id, req);
	if (!isCurrentSessionEpoch(epoch)) {
		throw new Error('stale session');
	}
	state.byId.set(role.id, role);
	state.list = state.list.map((r) => (r.id === role.id ? role : r));
	return role;
}

export async function remove(id: string): Promise<void> {
	const epoch = currentSessionEpoch();
	await api.roles.remove(id);
	if (!isCurrentSessionEpoch(epoch)) {
		throw new Error('stale session');
	}
	state.byId.delete(id);
	state.list = state.list.filter((r) => r.id !== id);
}

export function assign(userId: string, roleId: string): Promise<{
	user_id: string;
	role_id: string;
	assigned_at: string;
}> {
	return api.users.assignRole(userId, { role_id: roleId });
}

export function unassign(userId: string, roleId: string): Promise<void> {
	return api.users.unassignRole(userId, roleId);
}

// Re-export the pure permission helpers (so they are also available from the
// roles store, per §6.5).
export { myRolePermissions, channelAccess, can };
export type { RolePermissions, RoleContext, ChannelAccess };

// Full reset (logout / 401 / account switch).
export function reset(): void {
	state.byId.clear();
	state.list = [];
	state.loaded = false;
}

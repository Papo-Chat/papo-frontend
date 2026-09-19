// Roles store: the role list (byId + list) plus role assignment actions.

import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api';
import type { Role, RolePermissions } from '../types';
import {
	myRolePermissions,
	channelAccess,
	can,
	type RoleContext,
	type ChannelAccess,
} from '../utils/permissions';

export const state = $state({
	byId: new SvelteMap<string, Role>(),
	list: [] as Role[],
	loaded: false,
});

export async function load(): Promise<void> {
	const roles = await api.roles.list();
	const map = new SvelteMap<string, Role>();
	for (const r of roles) {
		map.set(r.id, r);
	}
	state.byId = map;
	state.list = roles;
	state.loaded = true;
}

export function create(req: { name: string; color: string | null; permissions: RolePermissions }): void {
	api.roles
		.create(req)
		.then((role) => {
			state.byId.set(role.id, role);
			const list = [...state.list, role];
			state.list = list;
		});
}

export function update(
	id: string,
	req: { name: string; color: string | null; permissions: RolePermissions }
): void {
	api.roles
		.update(id, req)
		.then((role) => {
			state.byId.set(role.id, role);
			const list = state.list.map((r) => (r.id === role.id ? role : r));
			state.list = list;
		});
}

export function remove(id: string): void {
	api.roles
		.remove(id)
		.then(() => {
			state.byId.delete(id);
			const list = state.list.filter((r) => r.id !== id);
			state.list = list;
		});
}

export function assign(userId: string, roleId: string): void {
	api.users.assignRole(userId, { role_id: roleId });
}

export function unassign(userId: string, roleId: string): void {
	api.users.unassignRole(userId, roleId);
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

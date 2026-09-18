// Session store — single source of truth for the current user (F10).
// - whoami seeds this store and the users/roles/settings stores.
// - Proactive refresh (F21): a timer refreshes before the 12h cookie TTL.
//   Refresh is never triggered by 401; the 401 hook calls invalidate().
// - invalidate() clears everything and revokes the session (logout).

import { api, setOnUnauthorized } from '../api';
import { seedMe, loadList as loadUsersList } from '../store/users.svelte';
import { load as loadRoles } from '../store/roles.svelte';
import { seed as seedSettings } from '../store/settings.svelte';
import type { RoleSummary } from '../types';

// 11h — refreshes before the 12h cookie expiry.
const REFRESH_INTERVAL = 11 * 3600 * 1000;

export const state = $state({
	userId: null as string | null,
	username: null as string | null,
	// base64 avatar blob (null when absent).
	avatarBlob: null as string | null,
	avatarFormat: '' as string,
	status: null as 'away' | 'busy' | null,
	roles: [] as RoleSummary[],
	loaded: false,
	loading: false,
});

let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer(): void {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
}

function startTimer(): void {
	stopTimer();
	if (typeof window === 'undefined') {
		return;
	}
	timer = setInterval(async () => {
		if (!state.userId) {
			return;
		}
		try {
			await api.auth.refresh();
		} catch {
			// Refresh failed; subsequent 401s go through the onUnauthorized
			// hook → invalidate().
		}
	}, REFRESH_INTERVAL);
}

export async function load(): Promise<void> {
	stopTimer();
	state.loading = true;
	setOnUnauthorized(() => invalidate());
	try {
		const me = await api.auth.whoami();
		state.userId = me.id;
		state.username = me.username;
		state.avatarBlob = me.avatar_blob;
		state.avatarFormat = me.avatar_format;
		state.status = me.status;
		state.roles = me.roles;
		// Seed the dependent stores.
		seedMe(me);
		await Promise.all([loadUsersList(), loadRoles()]);
		seedSettings(me.settings.config, me.settings.version);
		state.loaded = true;
		startTimer();
	} finally {
		state.loading = false;
	}
}

export function invalidate(): void {
	stopTimer();
	state.userId = null;
	state.username = null;
	state.avatarBlob = null;
	state.avatarFormat = '';
	state.status = null;
	state.roles = [];
	state.loaded = false;
	// Revoke the session on the server (clears the cookie).
	api.auth
		.logout()
		.catch(() => {});
}

export function meId(): string | null {
	return state.userId;
}

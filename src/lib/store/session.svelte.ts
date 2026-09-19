// Session store — single source of truth for the current user (F10).
// - whoami seeds this store and the users/roles/settings stores.
// - Proactive refresh (F21): a timer refreshes before the 12h cookie TTL.
//   Refresh is never triggered by 401; the 401 hook calls clearLocalSession().
// - logout() is the explicit "leave" action: revokes the server session,
//   then tears down all local state.
// - clearLocalSession() is the 401-only path: local teardown only, no server
//   call. It also disconnects the WS (no reconnect) and drops voice.

import { api, setOnUnauthorized } from '../api';
import { seedMe, loadList as loadUsersList, reset as usersReset } from '../store/users.svelte';
import { load as loadRoles, reset as rolesReset } from '../store/roles.svelte';
import { seed as seedSettings, reset as settingsReset } from '../store/settings.svelte';
import * as channelsStore from '../store/channels.svelte';
import * as messagesStore from '../store/messages.svelte';
import * as notificationsStore from '../store/notifications.svelte';
import * as emojisStore from '../store/emojis.svelte';
import * as websocketStore from '../store/websocket.svelte';
import * as voiceStore from '../store/voice.svelte';
import type { RoleSummary } from '../types';
import {
	bumpSessionEpoch,
	currentSessionEpoch,
	isCurrentSessionEpoch
} from '$lib/utils/session-epoch';

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
	loading: false
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
			// hook → clearLocalSession().
		}
	}, REFRESH_INTERVAL);
}

export async function load(): Promise<void> {
	stopTimer();
	state.loading = true;
	// The 401 hook calls clearLocalSession (local teardown only) — never the
	// server logout. A 401 means the session is already gone; public auth
	// requests (login/register) bypass the hook via authFailure: 'ignore'.
	setOnUnauthorized(() => clearLocalSession());
	try {
		const epoch = currentSessionEpoch();
		const me = await api.auth.whoami();
		if (!isCurrentSessionEpoch(epoch)) {
			throw new Error('stale session');
		}
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

// 401-only path: local teardown only, no server logout call.
export function clearLocalSession(): void {
	bumpSessionEpoch();
	stopTimer();
	// Stop the refresh timer, disconnect the WS (no reconnect), drop voice.
	websocketStore.disconnect();
	voiceStore.onSocketClose();
	// Clear the session itself.
	state.userId = null;
	state.username = null;
	state.avatarBlob = null;
	state.avatarFormat = '';
	state.status = null;
	state.roles = [];
	state.loaded = false;
	// Full reset of every user-specific store (logout / 401 / account switch).
	settingsReset();
	notificationsStore.reset();
	channelsStore.reset();
	messagesStore.reset();
	usersReset();
	rolesReset();
	emojisStore.reset();
}

// Explicit "leave": revoke the server session, then tear down locally.
export async function logout(): Promise<void> {
	try {
		await api.auth.logout();
	} finally {
		clearLocalSession();
	}
}

export function meId(): string | null {
	return state.userId;
}

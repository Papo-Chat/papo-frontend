// Session store — single source of truth for the current user (F10).
// - whoami seeds this store and the users/roles/settings stores.
// - Proactive refresh (F21): a timer refreshes before the 12h cookie TTL.
//   Refresh is never triggered by 401; the 401 hook calls clearLocalSession().
// - logout() is the explicit "leave" action: revokes the server session,
//   then tears down all local state.
// - clearLocalSession() is the 401-only path: local teardown only, no server
//   call. It also disconnects the WS (no reconnect) and drops voice.

import { api, setOnUnauthorized } from '../api';
import { seedMe, loadList as loadUsersList, reset as usersReset, setPersistedStatus } from '../store/users.svelte';
import { load as loadRoles, reset as rolesReset } from '../store/roles.svelte';
import { seed as seedSettings, reset as settingsReset } from '../store/settings.svelte';
import * as channelsStore from '../store/channels.svelte';
import * as messagesStore from '../store/messages.svelte';
import * as dmsStore from '../store/dms.svelte';
import * as blocksStore from '../store/blocks.svelte';
import * as notificationsStore from '../store/notifications.svelte';
import * as emojisStore from '../store/emojis.svelte';
import * as serverStore from '../store/server.svelte';
import * as websocketStore from '../store/websocket.svelte';
import * as voiceStore from '../store/voice.svelte';
import type { RoleSummary } from '../types';
import { prepareNotificationSound } from '../utils/notification-sound';
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
let activityCleanup: (() => void) | null = null;

function stopTimer(): void {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
}

function stopPresenceActivity(): void {
	activityCleanup?.();
	activityCleanup = null;
}

function startPresenceActivity(): void {
	stopPresenceActivity();
	if (typeof window === 'undefined') return;

	const onActivity = () => websocketStore.reportPresenceActivity();
	const events: Array<keyof WindowEventMap> = [
		'pointerdown',
		'pointermove',
		'keydown',
		'touchstart',
		'wheel',
		'scroll',
		'focus'
	];
	for (const event of events) {
		window.addEventListener(event, onActivity, { passive: true });
	}
	const onVisibility = () => {
		if (!document.hidden) websocketStore.reportPresenceActivity(true);
	};
	document.addEventListener('visibilitychange', onVisibility);

	activityCleanup = () => {
		for (const event of events) {
			window.removeEventListener(event, onActivity);
		}
		document.removeEventListener('visibilitychange', onVisibility);
	};
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
		void prepareNotificationSound(me.id).catch(() => {});
		// Seed the dependent stores.
		seedMe(me);
		await loadRoles();
		seedSettings(me.settings.config, me.settings.version);
		notificationsStore.load();
		void dmsStore.load().catch(() => {});
		void blocksStore.load().catch(() => {});

		// Emoji consumers always operate on the complete server list. Finish
		// pagination once during bootstrap; picker/admin never paginate.
		await emojisStore.loadAll();

		// Only the first member-directory page is loaded. Online/message/pin/
		// notification users are hydrated independently through summary_batch.
		state.loaded = true;
		void loadUsersList().catch(() => {});
		startTimer();
		startPresenceActivity();
		// Conexão WS (handshake com o mesmo cookie Auth). Só conecta quando a
		// sessão é válida; `clearLocalSession()`/logout chamam disconnect().
		websocketStore.connect();
	} finally {
		state.loading = false;
	}
}

// 401-only path: local teardown only, no server logout call.
export function clearLocalSession(): void {
	bumpSessionEpoch();
	stopTimer();
	stopPresenceActivity();
	// Stop the refresh timer, disconnect the WS (no reconnect), drop voice.
	websocketStore.disconnect();
	// disconnect() already tears down voice state.
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
	serverStore.reset();
	messagesStore.reset();
	dmsStore.reset();
	blocksStore.reset();
	usersReset();
	rolesReset();
	emojisStore.reset();
}

export async function setStatus(status: 'away' | 'busy' | null): Promise<void> {
	const userId = state.userId;
	if (!userId) throw new Error('usuário não autenticado');
	await api.users.updateStatus(userId, { status });
	state.status = status;
	setPersistedStatus(userId, status);
	// Manual status changes are independent from automatic inactivity. When
	// returning to online, report activity immediately so presence converges.
	if (status === null) websocketStore.reportPresenceActivity(true);
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

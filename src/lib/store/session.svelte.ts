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
const AUTO_AWAY_MS = 5 * 60 * 1000;

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
let awayTimer: ReturnType<typeof setTimeout> | null = null;
let lastActivityAt = Date.now();
let autoAwayApplied = false;
let awayRequestInFlight = false;
let returnOnlineRequested = false;
let activityCleanup: (() => void) | null = null;

function stopTimer(): void {
	if (timer) {
		clearInterval(timer);
		timer = null;
	}
}

function stopAutoAway(): void {
	if (awayTimer) {
		clearTimeout(awayTimer);
		awayTimer = null;
	}
	activityCleanup?.();
	activityCleanup = null;
	autoAwayApplied = false;
	awayRequestInFlight = false;
	returnOnlineRequested = false;
}

function restoreOnlineAfterAutoAway(): void {
	const userId = state.userId;
	if (!userId || !autoAwayApplied || awayRequestInFlight) return;

	returnOnlineRequested = false;
	awayRequestInFlight = true;
	void api.users.updateStatus(userId, { status: null })
		.then(() => {
			if (state.userId !== userId || !autoAwayApplied) return;
			autoAwayApplied = false;
			state.status = null;
			setPersistedStatus(userId, null);
			scheduleAutoAway();
		})
		.catch(() => {
			// Keep the auto-away marker so the next real activity retries.
			returnOnlineRequested = false;
		})
		.finally(() => {
			awayRequestInFlight = false;
			if (returnOnlineRequested && autoAwayApplied && state.userId === userId) {
				queueMicrotask(restoreOnlineAfterAutoAway);
			}
		});
}

function scheduleAutoAway(): void {
	if (awayTimer) clearTimeout(awayTimer);
	if (!state.userId || state.status !== null || autoAwayApplied) return;

	const remaining = Math.max(0, AUTO_AWAY_MS - (Date.now() - lastActivityAt));
	awayTimer = setTimeout(() => {
		awayTimer = null;
		if (!state.userId || state.status !== null || autoAwayApplied || awayRequestInFlight) return;
		if (Date.now() - lastActivityAt < AUTO_AWAY_MS) {
			scheduleAutoAway();
			return;
		}

		const userId = state.userId;
		awayRequestInFlight = true;
		void api.users.updateStatus(userId, { status: 'away' })
			.then(() => {
				if (state.userId !== userId || state.status !== null) return;
				autoAwayApplied = true;
				state.status = 'away';
				setPersistedStatus(userId, 'away');
			})
			.catch(() => {
				returnOnlineRequested = false;
				if (!autoAwayApplied && state.status === null) scheduleAutoAway();
			})
			.finally(() => {
				awayRequestInFlight = false;
				// Activity can happen while the request that marks the user away is
				// still in flight (especially after a suspended/background tab wakes).
				// Do not lose that activity: immediately restore online afterwards.
				if (returnOnlineRequested && autoAwayApplied && state.userId === userId) {
					queueMicrotask(restoreOnlineAfterAutoAway);
				}
			});
	}, remaining);
}

function startAutoAway(): void {
	stopAutoAway();
	if (typeof window === 'undefined') return;

	lastActivityAt = Date.now();

	const onActivity = () => {
		lastActivityAt = Date.now();

		if (state.userId && (autoAwayApplied || awayRequestInFlight)) {
			// Remember activity even while the away request itself is still
			// completing. Otherwise the first interaction after returning can be
			// swallowed and the user remains stuck as away.
			returnOnlineRequested = true;
			if (autoAwayApplied && !awayRequestInFlight) {
				restoreOnlineAfterAutoAway();
			}
			return;
		}

		if (state.status === null && !awayTimer) scheduleAutoAway();
	};

	const events: Array<keyof WindowEventMap> = [
		'pointerdown',
		'pointermove',
		'mousedown',
		'mousemove',
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
		if (!document.hidden) onActivity();
	};
	document.addEventListener('visibilitychange', onVisibility);

	activityCleanup = () => {
		for (const event of events) {
			window.removeEventListener(event, onActivity);
		}
		document.removeEventListener('visibilitychange', onVisibility);
	};
	scheduleAutoAway();
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
		startAutoAway();
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
	stopAutoAway();
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
	autoAwayApplied = false;
	returnOnlineRequested = false;
	state.status = status;
	setPersistedStatus(userId, status);
	lastActivityAt = Date.now();
	if (status === null) scheduleAutoAway();
	else if (awayTimer) {
		clearTimeout(awayTimer);
		awayTimer = null;
	}
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

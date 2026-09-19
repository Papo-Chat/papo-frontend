// WebSocket store — connects, pings (heartbeat every 30s), and dispatches
// inbound events to the correct store (F24).
//
// The raw WebSocket instance lives in ws.ts (plain module) so other stores
// (voice) can call send() without importing this reactive store.
//
// Lifecycle (P0.2):
// - `shouldReconnect` distinguishes a manual close (logout / 401) from a
//   network drop. Only the latter schedules a reconnect.
// - `generation` guards stale socket callbacks: a socket that was replaced
//   (manual disconnect / reconnect) must not touch state.
// - A reconnect (a socket that previously reached OPEN) triggers a minimal
//   REST resync (P1.10).

import { send as wsSend, setInstance } from '../ws';
import * as usersStore from '../store/users.svelte';
import * as rolesStore from '../store/roles.svelte';
import * as channelsStore from '../store/channels.svelte';
import * as messagesStore from '../store/messages.svelte';
import * as notificationsStore from '../store/notifications.svelte';
import * as voiceStore from '../store/voice.svelte';
import { meId as sessionMeId } from '../store/session.svelte';
import { PUBLIC_WS_URL } from '../env';
import type { WsOutbound, WsInbound, WsTyping } from '../types';

export const state = $state({
	connected: false,
	reconnectAttempts: 0,
	lastPing: 0,
	heartbeatTimer: 30000
});

let ws: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
let shouldReconnect = false;
// True after the first successful onopen; reset only on a manual close.
// A reconnect (drop → reconnect) therefore sees it still set and resyncs.
let hasConnected = false;

// Minimum order (P0.2): PUBLIC_WS_URL if defined, else same-origin /ws.
function wsUrl(): string {
	if (PUBLIC_WS_URL) {
		return PUBLIC_WS_URL;
	}
	const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${proto}//${window.location.host}/ws`;
}

function stopTimers(): void {
	if (pingTimer) {
		clearInterval(pingTimer);
		pingTimer = null;
	}
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
}

function startPing(socket: WebSocket, gen: number): void {
	if (pingTimer) {
		clearInterval(pingTimer);
		pingTimer = null;
	}

	pingTimer = setInterval(() => {
		if (gen !== generation || socket !== ws || socket.readyState !== WebSocket.OPEN) {
			return;
		}

		wsSend({
			type: 'heartbeat'
		} as WsInbound);

		state.lastPing = Date.now();
	}, state.heartbeatTimer);
}

// Minimal REST reconciliation after a reconnect (P1.10). Only run when a
// session is active. The fresh WS's `presence_sync` is the online source of
// truth; no full history reload.
function resync(): void {
	if (!sessionMeId()) {
		return;
	}
	channelsStore.load();
	const open = channelsStore.state.openChannelId;
	if (open) {
		messagesStore.load(open);
	}
	notificationsStore.load();
	rolesStore.load();
}

export function connect(): void {
	// Idempotent: already OPEN or CONNECTING → no-op.
	if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
		return;
	}
	shouldReconnect = true;
	const gen = ++generation;
	stopTimers();
	const socket = new WebSocket(wsUrl());

	ws = socket;
	setInstance(socket);
	socket.onopen = () => {
		if (gen !== generation || socket !== ws) {
			return;
		}
		const wasConnected = hasConnected;
		hasConnected = true;
		state.connected = true;
		state.reconnectAttempts = 0;
		startPing(socket, gen);
		if (wasConnected) {
			resync();
		}
	};
	socket.onmessage = (e) => {
		if (gen !== generation || socket !== ws) {
			return;
		}
		try {
			const event = JSON.parse(e.data as string) as WsOutbound;
			dispatchEvent(event);
		} catch {
			// ignore malformed frames
		}
	};
	socket.onclose = () => {
		if (gen !== generation || socket !== ws) {
			return;
		}
		stopTimers();
		state.connected = false;
		// The closed socket owned the call; tear down the voice peer (P0.1).
		// (manual close is handled by disconnect(), which bumps generation so
		// this callback is a no-op there.)
		voiceStore.onSocketClose();
		if (!shouldReconnect) {
			return;
		}
		// Network drop → reconnect with exponential backoff. The new WS is a
		// different owner of the call; re-entering voice is a separate action.
		state.reconnectAttempts += 1;
		const delay = Math.min(15000, 1000 * 2 ** state.reconnectAttempts);
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connect();
		}, delay);
	};
	socket.onerror = () => {
		if (gen !== generation || socket !== ws) {
			return;
		}
		// onclose follows; just ensure a clean close.
		ws?.close();
	};
}

export function disconnect(): void {
	// Manual close (logout / 401 / account switch): no reconnect.
	shouldReconnect = false;
	// Bump so any in-flight socket callbacks (captured older gen) are no-ops.
	generation += 1;
	stopTimers();
	const old = ws;
	ws = null;
	setInstance(null);
	// Reset so a fresh login's first onopen does not resync.
	hasConnected = false;
	state.connected = false;
	voiceStore.onSocketClose();
	old?.close();
}

// Dispatch an outbound event to the correct store (F24).
export function dispatchEvent(event: WsOutbound): void {
	switch (event.type) {
		case 'message':
			messagesStore.applyEvent(messagesStore.state, event);
			channelsStore.handleMessage(event);
			break;
		case 'message_edit':
		case 'message_delete':
		case 'message_pin':
		case 'react_update':
		case 'remove_preview':
		case 'link_preview_update':
		case 'attachment_moderation_update':
			messagesStore.applyEvent(messagesStore.state, event);
			break;
		case 'new_preview':
			messagesStore.handleNewPreview(event);
			break;
		case 'new_notification':
			notificationsStore.handleNewNotification();
			break;
		case 'channel_create':
			channelsStore.handleChannelCreate();
			break;
		case 'channel_update':
			channelsStore.handleChannelUpdate(event);
			break;
		case 'channel_delete':
			channelsStore.handleChannelDelete(event.channel_id);
			break;
		case 'typing':
			usersStore.setTyping(
				(event as WsTyping).channel_id,
				(event as WsTyping).user_id,
				(event as WsTyping).is_typing
			);
			break;
		case 'avatar_update':
			usersStore.handleAvatarUpdate(event.user_id);
			break;
		case 'presence_update':
			usersStore.handlePresenceUpdate(event);
			break;
		case 'presence_sync':
			usersStore.handlePresenceSync(event.members);
			break;
		case 'user_join':
			usersStore.handleUserJoin(event.user_id);
			break;
		case 'role_add':
			usersStore.handleRoleAdd(event.user_id);
			break;
		case 'role_remove':
			usersStore.handleRoleRemove(event.user_id);
			break;
		case 'voice_joined':
			voiceStore.onVoiceJoined(event);
			break;
		case 'voice_answer':
			voiceStore.onVoiceAnswer(event);
			break;
		case 'voice_offer':
			voiceStore.onVoiceOffer(event);
			break;
		case 'voice_ice_candidate':
			voiceStore.onVoiceIceCandidate(event);
			break;
		case 'voice_state_update':
			voiceStore.onVoiceStateUpdate(event);
			break;
		case 'active_speaker_update':
			voiceStore.onActiveSpeakerUpdate(event);
			break;
		case 'voice_leave':
			voiceStore.onVoiceLeave(event);
			break;
		case 'heartbeat_ack':
			break;
		case 'error':
			break;
		default:
			break;
	}
}

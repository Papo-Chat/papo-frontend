// WebSocket store — connects, pings (heartbeat every 30s), and dispatches
// inbound events to the correct store (F24).
//
// The raw WebSocket instance lives in ws.ts (plain module) so other stores
// (voice) can call send() without importing this reactive store.

import { send as wsSend, setInstance } from '../ws';
import * as usersStore from '../store/users.svelte';
import * as rolesStore from '../store/roles.svelte';
import * as channelsStore from '../store/channels.svelte';
import * as messagesStore from '../store/messages.svelte';
import * as notificationsStore from '../store/notifications.svelte';
import * as voiceStore from '../store/voice.svelte';
import type { WsOutbound, WsInbound, WsTyping } from '../types';

export const state = $state({
	connected: false,
	reconnectAttempts: 0,
	lastPing: 0,
	heartbeatTimer: 30000,
});

let ws: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function wsUrl(): string {
	const apiBase = (import.meta.env.PUBLIC_API_URL ?? '').replace(/\/$/, '');
	if (apiBase) {
		return apiBase.replace(/^http/, 'ws');
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

function startPing(): void {
	stopTimers();
	pingTimer = setInterval(() => {
		if (ws?.readyState === WebSocket.OPEN) {
			try {
				wsSend({ type: 'heartbeat' } as WsInbound);
			} catch {
				// ignore
			}
			state.lastPing = Date.now();
		}
	}, 30000);
}

function open(): void {
	state.connected = true;
	state.reconnectAttempts = 0;
	startPing();
}

function close(): void {
	stopTimers();
	state.connected = false;
}

export function connect(): void {
	stopTimers();
	ws = new WebSocket(wsUrl());
	setInstance(ws);
	ws.onopen = open;
	ws.onmessage = (e) => {
		try {
			const event = JSON.parse(e.data as string) as WsOutbound;
			dispatchEvent(event);
		} catch {
			// ignore malformed frames
		}
	};
	ws.onclose = () => {
		close();
		// Reconnect with exponential backoff.
		state.reconnectAttempts += 1;
		const delay = Math.min(15000, 1000 * 2 ** state.reconnectAttempts);
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connect();
		}, delay);
	};
	ws.onerror = () => {
		ws?.close();
	};
}

export function disconnect(): void {
	close();
	ws?.close();
	ws = null;
	setInstance(null);
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
		case 'new_notification':
			notificationsStore.handleNewNotification(event);
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
			usersStore.handleRoleAdd(event.user_id, event.role_id);
			break;
		case 'role_remove':
			usersStore.handleRoleRemove(event.user_id, event.role_id);
			break;
		case 'voice_joined':
			voiceStore.onVoiceJoined(event);
			break;
		case 'voice_answer':
			voiceStore.onVoiceAnswer(event);
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

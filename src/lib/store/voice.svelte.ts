// Voice store — manages the single RTCPeerConnection for the current voice
// channel. All signalling (offer/answer/ICE candidates) goes over the
// WebSocket; the peer is the one data/media channel (F20).

import { api } from '../api';
import { send as wsSend } from '../ws';
import type {
	ICEServer,
	VoiceState,
	WsActiveSpeakerUpdate,
	WsVoiceAnswer,
	WsVoiceIceCandidate,
	WsVoiceJoined,
	WsVoiceLeave,
	WsVoiceOffer,
	WsVoiceStateUpdate,
} from '../types';

export const state = $state({
	iceServers: [] as ICEServer[],
	peer: null as RTCPeerConnection | null,
	// Remote ICE candidates accumulated while awaiting the answer.
	remoteCandidates: [] as RTCIceCandidateInit[],
	// Current members in the room (from voice_joined).
	members: [] as VoiceState[],
	// Active speakers (from active_speaker_update).
	activeSpeakers: [] as string[],
	// The single currently-active speaker (F20).
	activeSpeaker: null as string | null,
	// Whether we are currently connected to a voice room.
	connected: false,
});

let peer: RTCPeerConnection | null = null;
let currentChannelId: string | null = null;
let mediaStream: MediaStream | null = null;
let dataChannel: RTCDataChannel | null = null;
let iceServerLoaded = false;

// ── lifecycle ─────────────────────────────────────────────

export function loadIceServers(): void {
	if (iceServerLoaded) {
		return;
	}
	api.voice
		.iceServers()
		.then((res) => {
			state.iceServers = res.ice_servers;
			iceServerLoaded = true;
		});
}

export function join(channelId: string): void {
	if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
		return;
	}
	// Leave any existing room first (single peer).
	if (peer) {
		peer.close();
	}
	currentChannelId = channelId;
	peer = new RTCPeerConnection({ iceServers: state.iceServers });
	state.peer = peer;

	navigator.mediaDevices
		.getUserMedia({ audio: true, video: true })
		.then((stream) => {
			mediaStream = stream;
			stream.getTracks().forEach((t) => {
				peer!.addTrack(t, stream);
			});
			sendOffer();
		})
		.catch(() => {
			// Permission denied / unsupported — leave the room.
			leave(channelId);
		});

	peer.ondatachannel = (e) => {
		dataChannel = e.channel;
		if (!dataChannel) {
			return;
		}
		dataChannel.onmessage = (m) => {
			try {
				const msg = JSON.parse(m.data as string);
				switch (msg.type) {
					case 'mute':
						state.activeSpeaker = msg.user_id;
						break;
					case 'camera':
						break;
					case 'screen_share':
						break;
				}
			} catch {
				// ignore malformed data
			}
		};
	};

	peer.onicecandidate = (e) => {
		if (!e.candidate) {
			return;
		}
		const candidate: WsVoiceIceCandidate = {
			type: 'voice_ice_candidate',
			channel_id: channelId,
			candidate: e.candidate.candidate,
			sdp_mid: e.candidate.sdpMid ?? null,
			sdp_mline_index: e.candidate.sdpMLineIndex ?? null,
		};
		try {
			wsSend(candidate);
		} catch {
			// not connected yet
		}
	};
}

function sendOffer(): void {
	if (!peer) {
		return;
	}
	const conn = peer;
	conn
		.createOffer()
		.then((offer) => {
			return conn.setLocalDescription(offer);
		})
		.then(() => {
			if (!conn.localDescription) {
				return;
			}
			const offer: WsVoiceOffer = {
				type: 'voice_offer',
				channel_id: currentChannelId!,
				sdp: conn.localDescription.sdp,
			};
			try {
				wsSend(offer);
			} catch {
				// not connected yet
			}
		})
		.catch(() => {});
}

export function leave(channelId: string): void {
	if (peer && currentChannelId === channelId) {
		peer.close();
	}
	if (mediaStream) {
		mediaStream.getTracks().forEach((t) => t.stop());
		mediaStream = null;
	}
	peer = null;
	state.peer = null;
	state.remoteCandidates = [];
	state.members = [];
	state.activeSpeakers = [];
	state.activeSpeaker = null;
	state.connected = false;
	currentChannelId = null;
	dataChannel = null;
}

// Evict the room when the channel is deleted.
export function clearRoom(channelId: string): void {
	if (currentChannelId === channelId) {
		leave(channelId);
	}
}

export function isJoined(channelId: string): boolean {
	return currentChannelId === channelId;
}

// ── signalling handlers (called by the websocket store) ───

export function onVoiceJoined(ev: WsVoiceJoined): void {
	if (currentChannelId !== ev.channel_id) {
		return;
	}
	state.members = ev.members;
	state.activeSpeakers = ev.active_speakers;
	if (ev.active_speakers.length === 1) {
		state.activeSpeaker = ev.active_speakers[0];
	}
	state.connected = true;
}

export function onVoiceAnswer(ev: WsVoiceAnswer): void {
	if (currentChannelId !== ev.channel_id || !peer) {
		return;
	}
	const conn = peer;
	conn
		.setRemoteDescription({ type: 'answer', sdp: ev.sdp })
		.then(() => {
			// Flush pending remote candidates.
			for (const c of state.remoteCandidates) {
				conn.addIceCandidate(c).catch(() => {});
			}
			state.remoteCandidates = [];
		})
		.catch(() => {});
}

export function onVoiceIceCandidate(ev: WsVoiceIceCandidate): void {
	if (currentChannelId !== ev.channel_id || !peer) {
		return;
	}
	const candidate: RTCIceCandidateInit = {
		candidate: ev.candidate,
		sdpMid: ev.sdp_mid ?? undefined,
		sdpMLineIndex: ev.sdp_mline_index ?? undefined,
	};
	if (peer.localDescription) {
		peer.addIceCandidate(candidate).catch(() => {});
	} else {
		state.remoteCandidates.push(candidate);
	}
}

export function onVoiceStateUpdate(ev: WsVoiceStateUpdate): void {
	if (currentChannelId !== ev.channel_id) {
		return;
	}
	const idx = state.members.findIndex((m) => m.user_id === ev.user_id);
	if (idx >= 0) {
		const next = [...state.members];
		next[idx] = {
			...next[idx],
			muted: ev.muted,
			camera_on: ev.camera_on,
			screen_sharing: ev.screen_sharing,
		};
		state.members = next;
	}
}

export function onActiveSpeakerUpdate(ev: WsActiveSpeakerUpdate): void {
	if (currentChannelId !== ev.channel_id) {
		return;
	}
	state.activeSpeakers = ev.user_ids;
	state.activeSpeaker = ev.user_ids.length === 1 ? ev.user_ids[0] : null;
}

export function onVoiceLeave(ev: WsVoiceLeave): void {
	if (currentChannelId !== ev.channel_id) {
		return;
	}
	state.members = state.members.filter((m) => m.user_id !== ev.user_id);
	if (state.activeSpeaker === ev.user_id) {
		state.activeSpeaker = null;
	}
}

// ── local controls (mute / camera / screen share) ────────

export function mute(muted: boolean): void {
	if (!peer) {
		return;
	}
	if (dataChannel?.readyState === 'open') {
		dataChannel.send(JSON.stringify({ type: 'mute', muted }));
	}
}

export function camera(on: boolean): void {
	if (!peer) {
		return;
	}
	if (dataChannel?.readyState === 'open') {
		dataChannel.send(JSON.stringify({ type: 'camera', on }));
	}
}

export function screenShare(on: boolean): void {
	if (!peer) {
		return;
	}
	if (dataChannel?.readyState === 'open') {
		dataChannel.send(JSON.stringify({ type: 'screen_share', on }));
	}
}

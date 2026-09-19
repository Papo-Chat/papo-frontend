// Voice store — manages the single RTCPeerConnection for the current voice
// channel. All signalling (offer/answer/ICE candidates) goes over the
// WebSocket; the peer is the single data/media channel (F20).
//
// Audio-only (P0.1). Camera/screen share are left coherent with the protocol
// (they send the correct WS messages) but not wired up.
//
// Rules that avoid big bugs:
// - All WebRTC signalling is serialized in a `queue` Promise.
// - Remote ICE is queued while `!peer.remoteDescription`.
// - ontrack associates remote audio by `transceiver.mid`, not `track.id`.
// - On WS close: stop local tracks, close the peer, clear voice state.
// - Never auto-rejoin after a reconnect; the new WS is a different owner of
//   the call. Re-entering is a separate action.

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
import type { WsInbound } from '../types';

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
let iceServerLoaded = false;
let audioEl: HTMLAudioElement | null = null;

// Serialized WebRTC signalling queue (P0.1).
let queue: Promise<void> | null = null;
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
	const p = new Promise<T>((resolve, reject) => {
		const work = () => {
			queue = null;
			fn().then(resolve, reject);
		};
		if (queue) {
			queue.then(work);
		} else {
			queue = Promise.resolve().then(work);
		}
	});
	return p;
}

// Remote ICE queued while `!peer.remoteDescription` (P0.1).
let queuedCandidates: RTCIceCandidateInit[] = [];

// Transceiver mids we've already associated a remote audio track for (P0.1).
const handledMids = new Set<string>();

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

// Resolve on the voice_joined unicast (sent by the server to the joining
// connection after a voice_join).
let joinResolve: ((v: void) => void) | null = null;

function waitVoiceJoined(): Promise<void> {
	return new Promise<void>((resolve) => {
		joinResolve = resolve;
	});
}

export function join(channelId: string): void {
	if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
		return;
	}
	// Leave any existing room first (single peer). `leave` closes the peer
	// only when it belongs to the room being left, so pass the room we are
	// currently in — passing the new channelId would not match it and the
	// old peer would be orphaned.
	leave(currentChannelId);
	currentChannelId = channelId;

	let stream: MediaStream | null = null;

	// Audio only.
	navigator.mediaDevices
		.getUserMedia({ audio: true })
		.then((s) => {
			stream = s;
			// Track it so leave()/onSocketClose() can stop the mic tracks.
			mediaStream = s;
			// 1. WS voice_join (before creating the peer / offering).
			if (!wsSend({ type: 'voice_join', channel_id: channelId } as WsInbound)) {
				throw new Error('ws not open');
			}
			// 2. Wait for voice_joined (unicast to this connection).
			return waitVoiceJoined();
		})
		.then(() => {
			if (stream === null) {
				return;
			}
			// 3. Create the peer after voice_joined.
			peer = new RTCPeerConnection({ iceServers: state.iceServers });
			state.peer = peer;
			// Associate remote audio by transceiver.mid (P0.1).
			peer.ontrack = (e) => onRemoteTrack(peer!, e);
			// 4. Add the mic track.
			const audioTrack = stream.getTracks().find((t) => t.kind === 'audio');
			if (audioTrack) {
				peer!.addTrack(audioTrack, stream);
			}
			// 5. Prepare the audio sink.
			setAudioSink(stream);
			// 6. Create offer / set local description / send voice_offer.
			sendOffer();
		})
		.catch(() => {
			// Permission denied / unsupported / ws closed → leave.
			leave(channelId);
		});
}

function setAudioSink(stream: MediaStream): void {
	if (typeof document !== 'undefined') {
		audioEl = new HTMLAudioElement();
		audioEl.srcObject = stream;
		audioEl.autoplay = true;
		// Attach once; the browser will route the remote audio through it.
	}
}

function sendOffer(): void {
	if (!peer) {
		return;
	}
	const conn = peer;
	const cid = currentChannelId;
	enqueue(
		() =>
			conn
				.createOffer()
				.then((offer) => conn.setLocalDescription(offer))
				.then(() => {
					if (!conn.localDescription || cid == null) {
						return;
					}
					if (!wsSend({ type: 'voice_offer', channel_id: cid, sdp: conn.localDescription.sdp } as WsInbound)) {
						return;
					}
				})
		)
		.catch(() => {});
}

export function leave(channelId: string | null): void {
	// Notify the server we are leaving the room we are in (if we are).
	// No-op on a failed join: `peer` is null until voice_joined, so a
	// spurious voice_leave is never sent for a room we never entered.
	if (currentChannelId != null && peer != null) {
		wsSend({ type: 'voice_leave', channel_id: currentChannelId } as WsInbound);
	}
	if (peer && (currentChannelId == null || currentChannelId === channelId)) {
		peer.close();
	}
	if (mediaStream) {
		mediaStream.getTracks().forEach((t) => t.stop());
		mediaStream = null;
	}
	if (audioEl) {
		audioEl.srcObject = null;
		audioEl = null;
	}
	peer = null;
	state.peer = null;
	state.remoteCandidates = [];
	state.members = [];
	state.activeSpeakers = [];
	state.activeSpeaker = null;
	state.connected = false;
	currentChannelId = null;
	queuedCandidates = [];
	handledMids.clear();
	queue = null;
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

// Called by the websocket store when the WS closes (P0.1). The call belongs
// to the old connection; tear down the peer and local state. No auto-rejoin.
export function onSocketClose(): void {
	if (peer) {
		peer.close();
	}
	if (mediaStream) {
		mediaStream.getTracks().forEach((t) => t.stop());
		mediaStream = null;
	}
	if (audioEl) {
		audioEl.srcObject = null;
		audioEl = null;
	}
	peer = null;
	state.peer = null;
	state.remoteCandidates = [];
	state.members = [];
	state.activeSpeakers = [];
	state.activeSpeaker = null;
	state.connected = false;
	queuedCandidates = [];
	handledMids.clear();
	queue = null;
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
	// Resolve the join wait.
	if (joinResolve) {
		joinResolve();
		joinResolve = null;
	}
}

// Answer to our voice_offer (unicast).
export function onVoiceAnswer(ev: WsVoiceAnswer): void {
	if (currentChannelId !== ev.channel_id || !peer) {
		return;
	}
	const conn = peer;
	enqueue(
		() =>
			conn
				.setRemoteDescription({ type: 'answer', sdp: ev.sdp })
				.then(() => {
					// Flush pending remote candidates.
					for (const c of state.remoteCandidates) {
						conn.addIceCandidate(c).catch(() => {});
					}
					state.remoteCandidates = [];
				})
		)
		.catch(() => {});
}

// Server-initiated renegotiation (P0.1: was previously unhandled).
export function onVoiceOffer(ev: WsVoiceOffer): void {
	if (currentChannelId !== ev.channel_id || !peer) {
		return;
	}
	const conn = peer;
	enqueue(
		() =>
			conn
				.setRemoteDescription({ type: 'offer', sdp: ev.sdp })
				.then(() => conn.createAnswer())
				.then((answer) => conn.setLocalDescription(answer))
				.then(() => {
					const cid = currentChannelId;
					if (cid && conn.localDescription) {
						wsSend({ type: 'voice_answer', channel_id: cid, sdp: conn.localDescription.sdp } as WsInbound);
					}
				})
		)
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
	if (peer.remoteDescription) {
		peer.addIceCandidate(candidate).catch(() => {});
	} else {
		queuedCandidates.push(candidate);
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
	const cid = currentChannelId;
	if (cid && !wsSend({ type: 'voice_mute', channel_id: cid, muted } as WsInbound)) {
		return;
	}
	const audioSender = state.peer?.getSenders().find((s) => s.track?.kind === 'audio');
	const audioTrack = audioSender?.track;
	if (audioTrack) {
		audioTrack.enabled = !muted;
	}
}

export function camera(on: boolean): void {
	if (!peer) {
		return;
	}
	const cid = currentChannelId;
	if (cid && !wsSend({ type: 'voice_camera', channel_id: cid, on } as WsInbound)) {
		return;
	}
	// Not wired up yet (audio-only).
}

export function screenShare(on: boolean): void {
	if (!peer) {
		return;
	}
	const cid = currentChannelId;
	if (on) {
		if (cid && !wsSend({ type: 'screen_share_start', channel_id: cid } as WsInbound)) {
			return;
		}
	} else {
		if (cid && !wsSend({ type: 'screen_share_stop', channel_id: cid } as WsInbound)) {
			return;
		}
	}
	// Not wired up yet (audio-only).
}

// ── ontrack: associate remote audio by transceiver.mid ────

function onRemoteTrack(
	peerConn: RTCPeerConnection,
	event: RTCTrackEvent
): void {
	if (event.track.kind !== 'audio') {
		return;
	}
	const mid = event.transceiver.mid;
	if (mid === null || handledMids.has(mid)) {
		return;
	}
	handledMids.add(mid);
	// Route the remote audio through the shared sink.
	if (audioEl) {
		audioEl.srcObject = new MediaStream([event.track]);
	}
}

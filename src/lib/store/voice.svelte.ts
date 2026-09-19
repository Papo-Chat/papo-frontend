// Voice store — manages the single RTCPeerConnection for the current voice
// channel. All signalling (offer/answer/ICE candidates) goes over the
// WebSocket; the peer is the single data/media channel (F20).
//
// Audio-only (P0.1). Camera/screen share are no-op
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
	WsVoiceStateUpdate
} from '../types';
import type { WsInbound } from '../types';

export const state = $state({
	iceServers: [] as ICEServer[],
	peer: null as RTCPeerConnection | null,
	// Current members in the room (from voice_joined).
	members: [] as VoiceState[],
	// Active speakers (from active_speaker_update).
	activeSpeakers: [] as string[],
	// The single currently-active speaker (F20).
	activeSpeaker: null as string | null,
	// Whether we are currently connected to a voice room.
	connected: false
});

let peer: RTCPeerConnection | null = null;
let currentChannelId: string | null = null;
let mediaStream: MediaStream | null = null;

let voiceGeneration = 0;
let joinResolve: (() => void) | null = null;
let joinTimer: ReturnType<typeof setTimeout> | null = null;
let serverJoinSent = false;

function clearJoinWait(): void {
	if (joinTimer) {
		clearTimeout(joinTimer);
		joinTimer = null;
	}

	joinResolve = null;
}

function waitVoiceJoined(timeoutMs = 10_000): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		clearJoinWait();

		joinResolve = () => {
			clearJoinWait();
			resolve();
		};

		joinTimer = setTimeout(() => {
			clearJoinWait();
			reject(new Error('voice_joined timeout'));
		}, timeoutMs);
	});
}

function cancelJoinWait(): void {
	const resolve = joinResolve;

	clearJoinWait();

	// Faz o await continuar; o generation check vai perceber
	// que esta tentativa ficou stale e abortá-la.
	resolve?.();
}

function isCurrentJoin(generation: number, channelId: string): boolean {
	return generation === voiceGeneration && currentChannelId === channelId;
}

// Serialized WebRTC signalling queue (P0.1).
let signalQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
	const run = signalQueue.then(fn, fn);

	signalQueue = run.then(
		() => undefined,
		() => undefined
	);

	return run;
}

// Remote ICE queued while `!peer.remoteDescription` (P0.1).
const queuedCandidates = new WeakMap<RTCPeerConnection, RTCIceCandidateInit[]>();

function queueCandidate(conn: RTCPeerConnection, candidate: RTCIceCandidateInit): void {
	const pending = queuedCandidates.get(conn) ?? [];
	pending.push(candidate);
	queuedCandidates.set(conn, pending);
}

async function flushQueuedCandidates(conn: RTCPeerConnection): Promise<void> {
	const pending = queuedCandidates.get(conn) ?? [];

	queuedCandidates.delete(conn);

	for (const candidate of pending) {
		try {
			await conn.addIceCandidate(candidate);
		} catch {
			// stale/inválido
		}
	}
}

// ── lifecycle ─────────────────────────────────────────────

export function join(channelId: string): void {
	if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
		return;
	}

	// Encerra qualquer call/join anterior.
	leave(currentChannelId);

	// Este número identifica ESTA tentativa específica de join.
	const generation = ++voiceGeneration;

	currentChannelId = channelId;

	void (async () => {
		let stream: MediaStream | null = null;

		try {
			// Mic + ICE pertencem à mesma tentativa de join.
			stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: false
			});

			if (!isCurrentJoin(generation, channelId)) {
				stream.getTracks().forEach((track) => track.stop());
				return;
			}

			mediaStream = stream;

			const ice = await api.voice.iceServers();

			if (!isCurrentJoin(generation, channelId)) {
				stream.getTracks().forEach((track) => track.stop());

				if (mediaStream === stream) {
					mediaStream = null;
				}

				return;
			}

			state.iceServers = ice.ice_servers;

			// Crie a espera ANTES de mandar voice_join.
			const joined = waitVoiceJoined();

			if (
				!wsSend({
					type: 'voice_join',
					channel_id: channelId
				} as WsInbound)
			) {
				throw new Error('ws not open');
			}

			serverJoinSent = true;

			await joined;

			// Pode ter ocorrido leave/join em outro canal enquanto
			// esperávamos voice_joined.
			if (!isCurrentJoin(generation, channelId)) {
				stream.getTracks().forEach((track) => track.stop());

				if (mediaStream === stream) {
					mediaStream = null;
				}

				return;
			}

			const conn = new RTCPeerConnection({
				iceServers: state.iceServers
			});

			// Pequena proteção antes de publicar o peer no estado.
			if (!isCurrentJoin(generation, channelId)) {
				conn.close();
				stream.getTracks().forEach((track) => track.stop());
				return;
			}

			peer = conn;
			state.peer = conn;

			conn.ontrack = (event) => {
				// Ignora eventos de um PeerConnection que já ficou velho.
				if (peer !== conn || !isCurrentJoin(generation, channelId)) {
					return;
				}

				onRemoteTrack(conn, event);
			};

			const audioTrack = stream.getAudioTracks().at(0);

			if (audioTrack) {
				// voice_joined começa muted=true no backend.
				audioTrack.enabled = false;
				conn.addTrack(audioTrack, stream);
			}

			sendOffer();
		} catch {
			stream?.getTracks().forEach((track) => track.stop());

			if (mediaStream === stream) {
				mediaStream = null;
			}

			if (isCurrentJoin(generation, channelId)) {
				leave(channelId);
			}
		}
	})();
}

function sendOffer(): void {
	if (!peer || !currentChannelId) return;

	const conn = peer;
	const cid = currentChannelId;

	void enqueue(async () => {
		const offer = await conn.createOffer();
		await conn.setLocalDescription(offer);

		await waitForIceGatheringComplete(conn);

		if (peer !== conn || currentChannelId !== cid || !conn.localDescription) {
			return;
		}

		wsSend({
			type: 'voice_offer',
			channel_id: cid,
			sdp: conn.localDescription.sdp
		} as WsInbound);
	}).catch(() => {});
}

export function leave(channelId: string | null): void {
	if (channelId !== null && currentChannelId !== null && channelId !== currentChannelId) {
		return;
	}

	voiceGeneration += 1;
	cancelJoinWait();

	const cid = currentChannelId;

	if (cid && serverJoinSent) {
		wsSend({
			type: 'voice_leave',
			channel_id: cid
		} as WsInbound);
	}

	serverJoinSent = false;

	peer?.close();

	if (mediaStream) {
		mediaStream.getTracks().forEach((track) => track.stop());

		mediaStream = null;
	}

	signalQueue = Promise.resolve();

	peer = null;
	state.peer = null;
	state.members = [];
	state.activeSpeakers = [];
	state.activeSpeaker = null;
	state.connected = false;

	currentChannelId = null;

	cleanupRemoteAudio();
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
	voiceGeneration += 1;
	cancelJoinWait();

	serverJoinSent = false;

	peer?.close();

	if (mediaStream) {
		mediaStream.getTracks().forEach((track) => track.stop());

		mediaStream = null;
	}

	signalQueue = Promise.resolve();

	peer = null;
	state.peer = null;
	state.members = [];
	state.activeSpeakers = [];
	state.activeSpeaker = null;
	state.connected = false;

	currentChannelId = null;

	cleanupRemoteAudio();
}

// ── signalling handlers (called by the websocket store) ───

export function onVoiceJoined(ev: WsVoiceJoined): void {
	if (currentChannelId !== ev.channel_id) {
		return;
	}

	state.members = ev.members;
	state.activeSpeakers = ev.active_speakers;
	state.activeSpeaker = ev.active_speakers.length === 1 ? ev.active_speakers[0] : null;

	state.connected = true;

	joinResolve?.();
}

// Answer to our voice_offer (unicast).
export function onVoiceAnswer(ev: WsVoiceAnswer): void {
	if (currentChannelId !== ev.channel_id || !peer) {
		return;
	}

	const conn = peer;
	const cid = ev.channel_id;

	void enqueue(async () => {
		if (peer !== conn || currentChannelId !== cid || conn.signalingState !== 'have-local-offer') {
			return;
		}

		await conn.setRemoteDescription({
			type: 'answer',
			sdp: ev.sdp
		});

		if (peer !== conn || currentChannelId !== cid) {
			return;
		}

		await flushQueuedCandidates(conn);
	}).catch(() => {});
}

function waitForIceGatheringComplete(conn: RTCPeerConnection, timeoutMs = 4500): Promise<void> {
	if (conn.iceGatheringState === 'complete') {
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		let finished = false;

		const finish = () => {
			if (finished) return;
			finished = true;

			conn.removeEventListener('icegatheringstatechange', onIceGatheringChange);

			clearTimeout(timer);
			resolve();
		};

		const onIceGatheringChange = () => {
			if (conn.iceGatheringState === 'complete') {
				finish();
			}
		};

		const timer = setTimeout(finish, timeoutMs);

		conn.addEventListener('icegatheringstatechange', onIceGatheringChange);
	});
}

// Server-initiated renegotiation (P0.1: was previously unhandled).
export function onVoiceOffer(ev: WsVoiceOffer): void {
	if (currentChannelId !== ev.channel_id || !peer) return;

	const conn = peer;
	const cid = ev.channel_id;

	void enqueue(async () => {
		if (peer !== conn || currentChannelId !== cid) return;

		if (conn.signalingState !== 'stable') {
			try {
				await conn.setLocalDescription({ type: 'rollback' });
			} catch {
				return;
			}
		}

		await conn.setRemoteDescription({
			type: 'offer',
			sdp: ev.sdp
		});

		await flushQueuedCandidates(conn);

		const answer = await conn.createAnswer();
		await conn.setLocalDescription(answer);

		await waitForIceGatheringComplete(conn);

		if (peer !== conn || currentChannelId !== cid || !conn.localDescription) {
			return;
		}

		wsSend({
			type: 'voice_answer',
			channel_id: cid,
			sdp: conn.localDescription.sdp
		} as WsInbound);
	}).catch(() => {});
}

export function onVoiceIceCandidate(ev: WsVoiceIceCandidate): void {
	if (currentChannelId !== ev.channel_id || !peer) {
		return;
	}

	const conn = peer;
	const cid = ev.channel_id;

	const candidate: RTCIceCandidateInit = {
		candidate: ev.candidate,
		sdpMid: ev.sdp_mid ?? undefined,
		sdpMLineIndex: ev.sdp_mline_index ?? undefined
	};

	if (!conn.remoteDescription) {
		queueCandidate(conn, candidate);
		return;
	}
	void enqueue(async () => {
		if (peer !== conn || currentChannelId !== cid) {
			return;
		}

		await conn.addIceCandidate(candidate);
	}).catch(() => {});
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
			screen_sharing: ev.screen_sharing
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

export function camera(_on: boolean): void {
	// TODO: implementar track + renegociação.
}

export function screenShare(_on: boolean): void {
	// TODO: implementar track + renegociação.
}

// ── ontrack: associate remote audio by transceiver.mid ────

const remoteAudios = new Map<string, HTMLAudioElement>();

function cleanupRemoteAudio(): void {
	for (const audio of remoteAudios.values()) {
		audio.pause();
		audio.srcObject = null;
		audio.remove();
	}

	remoteAudios.clear();
}

function onRemoteTrack(_peerConn: RTCPeerConnection, event: RTCTrackEvent): void {
	if (event.track.kind !== 'audio') return;

	const mid = event.transceiver.mid ?? `track:${event.track.id}`;

	let audio = remoteAudios.get(mid);

	if (!audio) {
		audio = document.createElement('audio');
		audio.autoplay = true;
		audio.hidden = true;

		document.body.appendChild(audio);
		remoteAudios.set(mid, audio);
	}

	const track = event.track;

	audio.srcObject = new MediaStream([track]);
	void audio.play().catch(() => {
		// autoplay bloqueado; a UI pode chamar resumeRemoteAudio()
	});

	track.addEventListener(
		'ended',
		() => {
			const current = remoteAudios.get(mid);
			if (!current) return;

			const currentTrack = (current.srcObject as MediaStream | null)?.getAudioTracks().at(0);

			// O MID já foi reutilizado para outra track.
			if (currentTrack !== track) {
				return;
			}

			current.pause();
			current.srcObject = null;
			current.remove();
			remoteAudios.delete(mid);
		},
		{ once: true }
	);
}

export async function resumeRemoteAudio(): Promise<void> {
	for (const audio of remoteAudios.values()) {
		try {
			await audio.play();
		} catch {
			// UI pode indicar autoplay bloqueado
		}
	}
}

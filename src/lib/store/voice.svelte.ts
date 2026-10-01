// Voice store — manages the single RTCPeerConnection for the current voice
// channel. All signalling (offer/answer/ICE candidates) goes over the
// WebSocket; the peer is the single data/media channel (F20).
//
// Audio + camera + screen share over the same SFU PeerConnection.
// Camera/screen intent is signalled before each client offer, matching the
// backend contract. Remote video is explicitly subscribed into the SFU's
// preallocated video slots.
//
// Rules that avoid big bugs:
// - All WebRTC signalling is serialized in a `queue` Promise.
// - Remote ICE is queued while `!peer.remoteDescription`.
// - ontrack associates remote audio by `transceiver.mid`, not `track.id`.
// - On WS close: stop local tracks, close the peer, clear voice state.
// - Never auto-rejoin after a reconnect; the new WS is a different owner of
//   the call. Re-entering is a separate action.

import { SvelteMap } from 'svelte/reactivity';
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
	PresenceMember
} from '../types';
import type { WsInbound, WsError } from '../types';

export type VoiceMediaKind = 'video' | 'screen';

export interface VoiceRemoteMedia {
	key: string;
	userId: string;
	kind: VoiceMediaKind;
	stream: MediaStream;
}

type RemoteVideoSlot = {
	transceiver: RTCRtpTransceiver;
	track: MediaStreamTrack;
	stream: MediaStream;
	assignmentKey: string | null;
};

type PendingAnswer = {
	conn: RTCPeerConnection;
	channelId: string;
	resolve: () => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

export const state = $state({
	iceServers: [] as ICEServer[],
	peer: null as RTCPeerConnection | null,
	// Current members in the room (from voice_joined).
	members: [] as VoiceState[],
	// Per-channel rosters for the sidebar voice tree. Keyed by channel_id and
	// fed by the same events as the room, but *not* gated on the current room
	// (a user sees a channel's participants even when not in it, as long as
	// they hold `connect_voice` — the server's `VoiceAudience`).
	channelMembers: new SvelteMap<string, VoiceState[]>(),
	// Active speakers (from active_speaker_update).
	activeSpeakers: [] as string[],
	// The single currently-active speaker (F20).
	activeSpeaker: null as string | null,
	// Whether we are currently connected to a voice room.
	connected: false,
	// Canal do room atual, reativo: o `currentChannelId` (módulo, não
	// rastreado) é usado só internamente; o UI precisa da versão reativa.
	channelId: null as string | null,
	localCameraStream: null as MediaStream | null,
	localScreenStream: null as MediaStream | null,
	remoteMedia: new SvelteMap<string, VoiceRemoteMedia>(),
	cameraBusy: false,
	screenBusy: false,
	lastError: null as string | null
});

let peer: RTCPeerConnection | null = null;
let currentChannelId: string | null = null;
let currentUserId: string | null = null;
let mediaStream: MediaStream | null = null;
let cameraTransceiver: RTCRtpTransceiver | null = null;
let screenTransceiver: RTCRtpTransceiver | null = null;

const remoteVideoSlots: RemoteVideoSlot[] = [];
const remoteSubscriptions = new Map<string, RemoteVideoSlot>();
const subscribeRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();

let pendingAnswer: PendingAnswer | null = null;
let offerChain: Promise<void> = Promise.resolve();
let mediaActionChain: Promise<void> = Promise.resolve();

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

export function join(channelId: string, userId?: string): void {
	if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
		return;
	}

	// Encerra qualquer call/join anterior.
	leave(currentChannelId);

	// Este número identifica ESTA tentativa específica de join.
	const generation = ++voiceGeneration;

	currentChannelId = channelId;
	currentUserId = userId ?? null;
	state.lastError = null;

	void (async () => {
		let stream: MediaStream | null = null;

		try {
			// Mic + ICE pertencem à mesma tentativa de join.
			stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					noiseSuppression: true,
					echoCancellation: true,
					autoGainControl: true
				},
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

			await sendOffer();
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

function clearPendingAnswer(error?: Error): void {
	const pending = pendingAnswer;
	if (!pending) return;

	clearTimeout(pending.timer);
	pendingAnswer = null;

	if (error) {
		pending.reject(error);
	} else {
		pending.resolve();
	}
}

function waitVoiceAnswer(conn: RTCPeerConnection, channelId: string, timeoutMs = 12_000): Promise<void> {
	clearPendingAnswer(new Error('renegociação substituída'));

	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			if (pendingAnswer?.conn === conn && pendingAnswer.channelId === channelId) {
				pendingAnswer = null;
			}
			reject(new Error('voice_answer timeout'));
		}, timeoutMs);

		pendingAnswer = {
			conn,
			channelId,
			resolve,
			reject,
			timer
		};
	});
}

async function sendOfferOnce(): Promise<void> {
	if (!peer || !currentChannelId) return;

	const conn = peer;
	const cid = currentChannelId;
	const answer = waitVoiceAnswer(conn, cid);

	try {
		await enqueue(async () => {
			if (peer !== conn || currentChannelId !== cid) {
				throw new Error('peer stale');
			}

			if (conn.signalingState !== 'stable') {
				throw new Error(`signaling state inválido: ${conn.signalingState}`);
			}

			const offer = await conn.createOffer();
			await conn.setLocalDescription(offer);

			await waitForIceGatheringComplete(conn);

			if (peer !== conn || currentChannelId !== cid || !conn.localDescription) {
				throw new Error('peer stale');
			}

			if (
				!wsSend({
					type: 'voice_offer',
					channel_id: cid,
					sdp: conn.localDescription.sdp
				} as WsInbound)
			) {
				throw new Error('ws not open');
			}
		});
	} catch (error) {
		clearPendingAnswer(error instanceof Error ? error : new Error(String(error)));
		throw error;
	}

	await answer;
}

function sendOffer(): Promise<void> {
	const run = offerChain.then(sendOfferOnce, sendOfferOnce);

	offerChain = run.then(
		() => undefined,
		() => undefined
	);

	return run;
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
	offerChain = Promise.resolve();
	mediaActionChain = Promise.resolve();
	clearPendingAnswer(new Error('voice left'));
	cleanupVideoMedia();

	peer = null;
	state.peer = null;
	state.members = [];
	state.activeSpeakers = [];
	state.activeSpeaker = null;
	state.connected = false;
	state.channelId = null;

	// Não limpar channelMembers aqui.
	// O roster representa o estado global dos canais de voz,
	// não apenas o canal em que este usuário está conectado.

	currentChannelId = null;
	currentUserId = null;
	state.lastError = null;

	cleanupRemoteAudio();
}

// Evict the room when the channel is deleted.
export function clearRoom(channelId: string): void {
	state.channelMembers.delete(channelId);
	if (currentChannelId === channelId) {
		leave(channelId);
	}
}

export function isJoined(channelId: string): boolean {
	// Lê `state.channelId` (reativo) em vez do `currentChannelId` de módulo
	// (variável não rastreada): sem isso, o UI nunca sai do estado inicial.
	return state.channelId === channelId;
}

// ── roster helpers (árvore de voz na sidebar) ──────────────
// Upsert a user's voice state into the per-channel roster. When the channel
// has no snapshot yet (the user never received `voice_joined` for it — a
// known limitation: the initial roster of never-joined channels is
// event-derived only), the roster is seeded with just this user.
function applyStateToRoster(channelId: string, state_: VoiceState): void {
	const members = state.channelMembers.get(channelId);
	if (members) {
		const idx = members.findIndex((m) => m.user_id === state_.user_id);
		if (idx >= 0) {
			const next = [...members];
			next[idx] = { ...next[idx], ...state_ };
			state.channelMembers.set(channelId, next);
		} else {
			state.channelMembers.set(channelId, [...members, state_]);
		}
	} else {
		state.channelMembers.set(channelId, [state_]);
	}
}

// Remove a user from the per-channel roster (voice_leave).
function removeUserFromRoster(channelId: string, userId: string): void {
	const members = state.channelMembers.get(channelId);
	if (!members) {
		return;
	}
	const next = members.filter((m) => m.user_id !== userId);
	state.channelMembers.set(channelId, next);
}

export function onPresenceSync(members: PresenceMember[]): void {
	const next = new SvelteMap<string, VoiceState[]>();

	for (const member of members) {
		for (const channelId of member.user_voice ?? []) {
			const current =
				state.channelMembers.get(channelId)?.find((voice) => voice.user_id === member.user_id) ??
				null;
			const list = next.get(channelId) ?? [];
			list.push(
				current ?? {
					user_id: member.user_id,
					muted: false,
					camera_on: false,
					screen_sharing: false
				}
			);
			next.set(channelId, list);
		}
	}

	state.channelMembers = next;
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
	offerChain = Promise.resolve();
	mediaActionChain = Promise.resolve();
	clearPendingAnswer(new Error('socket closed'));
	cleanupVideoMedia();

	peer = null;
	state.peer = null;
	state.members = [];
	state.activeSpeakers = [];
	state.activeSpeaker = null;
	state.connected = false;
	state.channelId = null;
	state.channelMembers.clear();

	currentChannelId = null;
	currentUserId = null;

	cleanupRemoteAudio();
}

// ── signalling handlers (called by the websocket store) ───

export function onVoiceJoined(ev: WsVoiceJoined): void {
	// Roster: full snapshot for this channel (voice_joined is unicast to the
	// joining client). Applied regardless of the current room so the sidebar
	// voice tree can render any channel the user has `connect_voice` on.
	state.channelMembers.set(ev.channel_id, ev.members);

	if (currentChannelId !== ev.channel_id) {
		return;
	}

	state.members = ev.members;
	state.activeSpeakers = ev.active_speakers;
	state.activeSpeaker = ev.active_speakers.length === 1 ? ev.active_speakers[0] : null;

	state.connected = true;
	state.channelId = ev.channel_id;
	state.lastError = null;

	joinResolve?.();
	queueMicrotask(reconcileRemoteVideoSubscriptions);
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
		clearPendingAnswer();
		reconcileRemoteVideoSubscriptions();
	}).catch((error) => {
		clearPendingAnswer(error instanceof Error ? error : new Error(String(error)));
	});
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
				clearPendingAnswer(new Error('renegociação iniciada pelo servidor'));
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
	// Roster: broadcast to the channel audience (connect_voice holders, incl.
	// non-callers) — never gated on the current room.
	applyStateToRoster(ev.channel_id, {
		user_id: ev.user_id,
		muted: ev.muted,
		camera_on: ev.camera_on,
		screen_sharing: ev.screen_sharing
	});

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

	if (ev.muted) {
		state.activeSpeakers = state.activeSpeakers.filter((id) => id !== ev.user_id);

		if (state.activeSpeaker === ev.user_id) {
			state.activeSpeaker = null;
		}
	}

	reconcileRemoteVideoSubscriptions();
}

export function onActiveSpeakerUpdate(ev: WsActiveSpeakerUpdate): void {
	if (currentChannelId !== ev.channel_id) {
		return;
	}

	const users = ev.user_ids ?? [];

	state.activeSpeakers = users;
	state.activeSpeaker = users.length === 1 ? users[0] : null;
}

export function onVoiceLeave(ev: WsVoiceLeave): void {
	// Roster: broadcast to the channel audience (connect_voice holders) —
	// never gated on the current room.
	removeUserFromRoster(ev.channel_id, ev.user_id);

	if (currentChannelId !== ev.channel_id) {
		return;
	}
	state.members = state.members.filter((m) => m.user_id !== ev.user_id);
	if (state.activeSpeaker === ev.user_id) {
		state.activeSpeaker = null;
	}
	reconcileRemoteVideoSubscriptions();
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

function serializeMediaAction(fn: () => Promise<void>): Promise<void> {
	const run = mediaActionChain.then(fn, fn);
	mediaActionChain = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}

function ensureActivePeer(): { conn: RTCPeerConnection; channelId: string } {
	if (!peer || !currentChannelId || !state.connected) {
		throw new Error('Entre no canal de voz antes de compartilhar mídia.');
	}
	return { conn: peer, channelId: currentChannelId };
}

async function rollbackLocalOffer(conn: RTCPeerConnection): Promise<void> {
	if (conn.signalingState !== 'have-local-offer') return;
	try {
		await conn.setLocalDescription({ type: 'rollback' });
	} catch {
		// A conexão pode ter fechado enquanto a permissão de mídia estava aberta.
	}
}

function stopStream(stream: MediaStream | null): void {
	if (!stream) return;
	for (const track of stream.getTracks()) {
		track.onended = null;
		track.stop();
	}
}

async function setCamera(targetOn: boolean): Promise<void> {
	const { conn, channelId } = ensureActivePeer();
	const currentlyOn = state.localCameraStream !== null;
	if (targetOn === currentlyOn) return;

	state.cameraBusy = true;
	state.lastError = null;

	try {
		if (targetOn) {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: {
					width: { ideal: 1280 },
					height: { ideal: 720 },
					frameRate: { ideal: 30, max: 30 }
				}
			});
			const track = stream.getVideoTracks().at(0);
			if (!track) {
				stopStream(stream);
				throw new Error('Nenhuma câmera disponível.');
			}
			if (peer !== conn || currentChannelId !== channelId) {
				stopStream(stream);
				throw new Error('A chamada foi encerrada.');
			}

			if (!cameraTransceiver) {
				cameraTransceiver = conn.addTransceiver(track, {
					direction: 'sendonly',
					streams: [stream]
				});
			} else {
				await cameraTransceiver.sender.replaceTrack(track);
				cameraTransceiver.direction = 'sendonly';
			}
			state.localCameraStream = stream;

			if (!wsSend({ type: 'voice_camera', channel_id: channelId, on: true } as WsInbound)) {
				throw new Error('WebSocket desconectado.');
			}

			try {
				await sendOffer();
			} catch (error) {
				await rollbackLocalOffer(conn);
				await cameraTransceiver.sender.replaceTrack(null);
				cameraTransceiver.direction = 'inactive';
				stopStream(stream);
				if (state.localCameraStream === stream) state.localCameraStream = null;
				wsSend({ type: 'voice_camera', channel_id: channelId, on: false } as WsInbound);
				throw error;
			}
		} else {
			if (!wsSend({ type: 'voice_camera', channel_id: channelId, on: false } as WsInbound)) {
				throw new Error('WebSocket desconectado.');
			}

			const previous = state.localCameraStream;
			state.localCameraStream = null;
			if (cameraTransceiver) {
				await cameraTransceiver.sender.replaceTrack(null);
				cameraTransceiver.direction = 'inactive';
			}
			stopStream(previous);

			try {
				await sendOffer();
			} catch (error) {
				await rollbackLocalOffer(conn);
				throw error;
			}
		}
	} finally {
		state.cameraBusy = false;
	}
}

export function camera(on?: boolean): Promise<void> {
	const target = on ?? state.localCameraStream === null;
	return serializeMediaAction(() => setCamera(target));
}

async function setScreenShare(targetOn: boolean): Promise<void> {
	const { conn, channelId } = ensureActivePeer();
	const currentlyOn = state.localScreenStream !== null;
	if (targetOn === currentlyOn) return;

	state.screenBusy = true;
	state.lastError = null;

	try {
		if (targetOn) {
			if (!navigator.mediaDevices.getDisplayMedia) {
				throw new Error('Compartilhamento de tela não é suportado neste navegador.');
			}

			const stream = await navigator.mediaDevices.getDisplayMedia({
				audio: false,
				video: {
					frameRate: { ideal: 30, max: 30 }
				}
			});
			const track = stream.getVideoTracks().at(0);
			if (!track) {
				stopStream(stream);
				throw new Error('Nenhuma tela selecionada.');
			}
			if (peer !== conn || currentChannelId !== channelId) {
				stopStream(stream);
				throw new Error('A chamada foi encerrada.');
			}

			if (!screenTransceiver) {
				screenTransceiver = conn.addTransceiver(track, {
					direction: 'sendonly',
					streams: [stream]
				});
			} else {
				await screenTransceiver.sender.replaceTrack(track);
				screenTransceiver.direction = 'sendonly';
			}
			state.localScreenStream = stream;

			track.onended = () => {
				if (state.localScreenStream === stream) {
					void screenShare(false);
				}
			};

			if (!wsSend({ type: 'screen_share_start', channel_id: channelId } as WsInbound)) {
				throw new Error('WebSocket desconectado.');
			}

			try {
				await sendOffer();
			} catch (error) {
				await rollbackLocalOffer(conn);
				await screenTransceiver.sender.replaceTrack(null);
				screenTransceiver.direction = 'inactive';
				stopStream(stream);
				if (state.localScreenStream === stream) state.localScreenStream = null;
				wsSend({ type: 'screen_share_stop', channel_id: channelId } as WsInbound);
				throw error;
			}
		} else {
			if (!wsSend({ type: 'screen_share_stop', channel_id: channelId } as WsInbound)) {
				throw new Error('WebSocket desconectado.');
			}

			const previous = state.localScreenStream;
			state.localScreenStream = null;
			if (screenTransceiver) {
				await screenTransceiver.sender.replaceTrack(null);
				screenTransceiver.direction = 'inactive';
			}
			stopStream(previous);

			try {
				await sendOffer();
			} catch (error) {
				await rollbackLocalOffer(conn);
				throw error;
			}
		}
	} finally {
		state.screenBusy = false;
	}
}

export function screenShare(on?: boolean): Promise<void> {
	const target = on ?? state.localScreenStream === null;
	return serializeMediaAction(() => setScreenShare(target));
}

export function onVoiceError(ev: WsError): void {
	if (!ev.code?.startsWith('voice-')) return;
	state.lastError = ev.message;
	clearPendingAnswer(new Error(ev.message));
}

function mediaKey(userId: string, kind: VoiceMediaKind): string {
	return `${userId}:${kind}`;
}

function desiredRemoteMedia(): Array<{ key: string; userId: string; kind: VoiceMediaKind }> {
	const desired: Array<{ key: string; userId: string; kind: VoiceMediaKind }> = [];

	for (const member of state.members) {
		if (member.user_id === currentUserId) continue;
		if (member.camera_on) {
			desired.push({
				key: mediaKey(member.user_id, 'video'),
				userId: member.user_id,
				kind: 'video'
			});
		}
		if (member.screen_sharing) {
			desired.push({
				key: mediaKey(member.user_id, 'screen'),
				userId: member.user_id,
				kind: 'screen'
			});
		}
	}

	return desired;
}

function clearSubscribeRetry(key: string): void {
	const timer = subscribeRetryTimers.get(key);
	if (timer) clearTimeout(timer);
	subscribeRetryTimers.delete(key);
}

function sendSubscriptionWithRetry(
	key: string,
	userId: string,
	kind: VoiceMediaKind,
	attempt = 0
): void {
	if (!currentChannelId || !remoteSubscriptions.has(key)) return;

	wsSend({
		type: 'track_subscribe',
		channel_id: currentChannelId,
		publisher_id: userId,
		kind
	} as WsInbound);

	if (attempt >= 3) return;

	clearSubscribeRetry(key);
	const timer = setTimeout(
		() => {
			const stillDesired = desiredRemoteMedia().some((item) => item.key === key);
			if (!stillDesired || !remoteSubscriptions.has(key)) return;
			sendSubscriptionWithRetry(key, userId, kind, attempt + 1);
		},
		700 * 2 ** attempt
	);
	subscribeRetryTimers.set(key, timer);
}

function releaseRemoteSubscription(key: string, notifyServer = true): void {
	const slot = remoteSubscriptions.get(key);
	if (!slot) return;

	const media = state.remoteMedia.get(key);
	if (notifyServer && media && currentChannelId) {
		wsSend({
			type: 'track_unsubscribe',
			channel_id: currentChannelId,
			publisher_id: media.userId,
			kind: media.kind
		} as WsInbound);
	}

	clearSubscribeRetry(key);
	remoteSubscriptions.delete(key);
	slot.assignmentKey = null;
	state.remoteMedia.delete(key);
}

function reconcileRemoteVideoSubscriptions(): void {
	if (!currentChannelId || !peer) return;

	const desired = desiredRemoteMedia();
	const wanted = new Set(desired.map((item) => item.key));

	for (const key of [...remoteSubscriptions.keys()]) {
		if (!wanted.has(key)) {
			releaseRemoteSubscription(key);
		}
	}

	for (const item of desired) {
		if (remoteSubscriptions.has(item.key)) continue;

		const slot = remoteVideoSlots.find((candidate) => candidate.assignmentKey === null);
		if (!slot) break;

		slot.assignmentKey = item.key;
		remoteSubscriptions.set(item.key, slot);
		state.remoteMedia.set(item.key, {
			key: item.key,
			userId: item.userId,
			kind: item.kind,
			stream: slot.stream
		});
		sendSubscriptionWithRetry(item.key, item.userId, item.kind);
	}
}

function cleanupVideoMedia(): void {
	stopStream(state.localCameraStream);
	stopStream(state.localScreenStream);
	state.localCameraStream = null;
	state.localScreenStream = null;
	state.cameraBusy = false;
	state.screenBusy = false;

	cameraTransceiver = null;
	screenTransceiver = null;

	for (const timer of subscribeRetryTimers.values()) clearTimeout(timer);
	subscribeRetryTimers.clear();
	remoteSubscriptions.clear();
	remoteVideoSlots.length = 0;
	state.remoteMedia.clear();
}

// ── ontrack: associate remote audio by transceiver.mid ────

const remoteAudios = new SvelteMap<string, HTMLAudioElement>();

function cleanupRemoteAudio(): void {
	for (const audio of remoteAudios.values()) {
		audio.pause();
		audio.srcObject = null;
		audio.remove();
	}

	remoteAudios.clear();
}

function onRemoteTrack(_peerConn: RTCPeerConnection, event: RTCTrackEvent): void {
	const track = event.track;

	if (track.kind === 'video') {
		let slot = remoteVideoSlots.find((candidate) => candidate.transceiver === event.transceiver);

		if (!slot) {
			slot = {
				transceiver: event.transceiver,
				track,
				stream: new MediaStream([track]),
				assignmentKey: null
			};
			remoteVideoSlots.push(slot);
			remoteVideoSlots.sort((a, b) => {
				const am = Number(a.transceiver.mid);
				const bm = Number(b.transceiver.mid);
				return Number.isFinite(am) && Number.isFinite(bm) ? am - bm : 0;
			});
		} else {
			slot.track = track;
			slot.stream = new MediaStream([track]);
			if (slot.assignmentKey) {
				const media = state.remoteMedia.get(slot.assignmentKey);
				if (media) {
					state.remoteMedia.set(slot.assignmentKey, { ...media, stream: slot.stream });
				}
			}
		}

		track.addEventListener(
			'ended',
			() => {
				const current = remoteVideoSlots.find(
					(candidate) => candidate.transceiver === event.transceiver
				);
				if (!current || current.track !== track) return;
				if (current.assignmentKey) {
					releaseRemoteSubscription(current.assignmentKey, false);
				}
				const index = remoteVideoSlots.indexOf(current);
				if (index >= 0) remoteVideoSlots.splice(index, 1);
			},
			{ once: true }
		);

		reconcileRemoteVideoSubscriptions();
		return;
	}

	if (track.kind !== 'audio') return;

	const mid = event.transceiver.mid ?? `track:${track.id}`;

	let audio = remoteAudios.get(mid);

	if (!audio) {
		audio = document.createElement('audio');
		audio.autoplay = true;
		audio.hidden = true;

		document.body.appendChild(audio);
		remoteAudios.set(mid, audio);
	}

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

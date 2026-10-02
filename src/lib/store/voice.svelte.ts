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
import { PUBLIC_VOICE_AUDIO_SLOTS, PUBLIC_VOICE_VIDEO_SLOTS } from '../env';
import type {
	ICEServer,
	VoiceState,
	WsActiveSpeakerUpdate,
	WsVoiceAnswer,
	WsVoiceIceCandidate,
	WsVoiceJoined,
	WsVoiceLeave,
	WsVoiceAudioRoutes,
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
	// Estado local da sessão, independente do componente/rota atualmente montado.
	localMuted: true,
	// Canal do room atual, reativo: o `currentChannelId` (módulo, não
	// rastreado) é usado só internamente; o UI precisa da versão reativa.
	channelId: null as string | null,
	localCameraStream: null as MediaStream | null,
	localScreenStream: null as MediaStream | null,
	remoteMedia: new SvelteMap<string, VoiceRemoteMedia>(),
	// Track ID do slot SFU -> user_id do publisher (voice_audio_routes).
	remoteAudioRoutes: new SvelteMap<string, string>(),
	// Preferências locais por usuário; nunca são enviadas ao servidor.
	remoteUserVolumes: new SvelteMap<string, number>(),
	remoteUserMuted: new SvelteMap<string, boolean>(),
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

let audioContext: AudioContext | null = null;
let audioDestination: MediaStreamAudioDestinationNode | null = null;
let micAudioSource: MediaStreamAudioSourceNode | null = null;
let micGain: GainNode | null = null;
let screenAudioSource: MediaStreamAudioSourceNode | null = null;
let outboundAudioTrack: MediaStreamTrack | null = null;
let localAudioSender: RTCRtpSender | null = null;
let micMuted = true;

const remoteVideoSlots: RemoteVideoSlot[] = [];
const remoteSubscriptions = new Map<string, RemoteVideoSlot | null>();

let pendingAnswer: PendingAnswer | null = null;
let offerChain: Promise<void> = Promise.resolve();
let mediaActionChain: Promise<void> = Promise.resolve();

// voice_joined confirma membership, mas os slots do SFU só existem depois
// que o primeiro voice_offer/voice_answer termina.
let mediaSubscriptionsReady = false;

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
	micMuted = true;
	state.localMuted = true;
	mediaSubscriptionsReady = false;
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

			// Reserve SFU receive slots in the client offer. The backend ignores
			// recvonly m-lines when classifying our own camera/screen publications.
			for (let i = 0; i < PUBLIC_VOICE_VIDEO_SLOTS; i += 1) {
				conn.addTransceiver('video', { direction: 'recvonly' });
			}
			for (let i = 0; i < PUBLIC_VOICE_AUDIO_SLOTS; i += 1) {
				conn.addTransceiver('audio', { direction: 'recvonly' });
			}

			conn.ontrack = (event) => {
				// Ignora eventos de um PeerConnection que já ficou velho.
				if (peer !== conn || !isCurrentJoin(generation, channelId)) {
					return;
				}

				onRemoteTrack(conn, event);
			};


			const audioTrack = stream.getAudioTracks().at(0);

			if (audioTrack) {
				// O backend publica uma única track de áudio por peer. Mantemos
				// um MID estável e mixamos mic + áudio da tela nessa track.
				const mixedTrack = await setupAudioMixer(stream);

				if (mixedTrack) {
					localAudioSender = conn.addTrack(
						mixedTrack,
						new MediaStream([mixedTrack])
					);
				} else {
					// Fallback: mantém o áudio de voz normal, sem áudio da tela.
					audioTrack.enabled = false;
					localAudioSender = conn.addTrack(audioTrack, stream);
				}
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

function cleanupLocalVoiceSession(options: {
	clearChannelMembers?: boolean;
	error?: string | null;
} = {}): void {
	voiceGeneration += 1;
	cancelJoinWait();
	serverJoinSent = false;

	cleanupAudioMixer();
	const oldPeer = peer;
	peer = null;
	oldPeer?.close();

	if (mediaStream) {
		mediaStream.getTracks().forEach((track) => track.stop());
		mediaStream = null;
	}

	signalQueue = Promise.resolve();
	offerChain = Promise.resolve();
	mediaActionChain = Promise.resolve();
	mediaSubscriptionsReady = false;
	clearPendingAnswer(new Error(options.error ?? 'voice ended'));
	cleanupVideoMedia();

	state.peer = null;
	state.members = [];
	state.activeSpeakers = [];
	state.activeSpeaker = null;
	state.connected = false;
	state.channelId = null;
	state.localMuted = true;
	if (options.clearChannelMembers) state.channelMembers.clear();

	currentChannelId = null;
	currentUserId = null;
	state.lastError = options.error ?? null;

	cleanupRemoteAudio();
}

export function leave(channelId: string | null): void {
	if (channelId !== null && currentChannelId !== null && channelId !== currentChannelId) {
		return;
	}

	const cid = currentChannelId;
	if (cid && serverJoinSent) {
		wsSend({
			type: 'voice_leave',
			channel_id: cid
		} as WsInbound);
	}

	cleanupLocalVoiceSession();
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

export function shouldShowGlobalSession(pathname: string): boolean {
	return (
		state.connected &&
		state.channelId !== null &&
		pathname !== `/channels/${state.channelId}`
	);
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
	cleanupLocalVoiceSession({ clearChannelMembers: true });
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

		// O backend já executou allocateSlots() antes de emitir este answer.
		// Só a partir daqui track_subscribe pode ser enviado com segurança.
		mediaSubscriptionsReady = true;
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
	} else {
		// voice_joined só é enviado ao usuário que entrou. Para quem já estava
		// na call, o primeiro voice_state_update é também o evento de entrada.
		// Sem este upsert, usuários que entram depois nunca chegam em
		// desiredRemoteMedia(), então câmera/tela deles não é assinada.
		state.members = [
			...state.members,
			{
				user_id: ev.user_id,
				muted: ev.muted,
				camera_on: ev.camera_on,
				screen_sharing: ev.screen_sharing
			}
		];
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

export function onVoiceAudioRoutes(ev: WsVoiceAudioRoutes): void {
	if (currentChannelId !== ev.channel_id) {
		return;
	}

	state.remoteAudioRoutes.clear();
	for (const route of ev.routes) {
		state.remoteAudioRoutes.set(route.track_id, route.user_id);
	}

	refreshRemoteAudioBindings();
	applyAllRemoteAudioPreferences();
}

export function isLocalVoiceLeave(
	ev: Pick<WsVoiceLeave, 'channel_id' | 'user_id'>,
	channelId: string | null,
	userId: string | null
): boolean {
	return channelId !== null && userId !== null && ev.channel_id === channelId && ev.user_id === userId;
}

export function onVoiceLeave(ev: WsVoiceLeave): void {
	// Roster: broadcast to the channel audience (connect_voice holders) —
	// never gated on the current room.
	removeUserFromRoster(ev.channel_id, ev.user_id);

	if (currentChannelId !== ev.channel_id) {
		return;
	}
	if (isLocalVoiceLeave(ev, currentChannelId, currentUserId)) {
		cleanupLocalVoiceSession({ error: 'Você não está mais conectado à sala de voz.' });
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

	micMuted = muted;
	state.localMuted = muted;

	if (cid && currentUserId) {
		state.members = state.members.map((member) =>
			member.user_id === currentUserId ? { ...member, muted } : member
		);
		const roster = state.channelMembers.get(cid);
		if (roster) {
			state.channelMembers.set(
				cid,
				roster.map((member) =>
					member.user_id === currentUserId ? { ...member, muted } : member
				)
			);
		}
		if (muted && state.activeSpeaker === currentUserId) {
			state.activeSpeaker = null;
		}
	}

	if (micGain) {
		// Mute afeta apenas o microfone. Áudio capturado junto com a tela
		// continua no mix enquanto o compartilhamento estiver ativo.
		micGain.gain.value = muted ? 0 : 1;
		return;
	}

	// Fallback sem Web Audio.
	const track = localAudioSender?.track;
	if (track) {
		track.enabled = !muted;
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

async function setupAudioMixer(micStream: MediaStream): Promise<MediaStreamTrack | null> {
	const micTrack = micStream.getAudioTracks().at(0);
	if (!micTrack || typeof AudioContext === 'undefined') {
		return null;
	}

	try {
		audioContext = new AudioContext();
		audioDestination = audioContext.createMediaStreamDestination();
		micAudioSource = audioContext.createMediaStreamSource(new MediaStream([micTrack]));
		micGain = audioContext.createGain();
		micGain.gain.value = micMuted ? 0 : 1;

		micAudioSource.connect(micGain);
		micGain.connect(audioDestination);

		outboundAudioTrack = audioDestination.stream.getAudioTracks().at(0) ?? null;

		if (audioContext.state === 'suspended') {
			await audioContext.resume().catch(() => {});
		}

		return outboundAudioTrack;
	} catch {
		cleanupAudioMixer();
		return null;
	}
}

function detachScreenAudio(): void {
	if (!screenAudioSource) return;

	try {
		screenAudioSource.disconnect();
	} catch {
		// já desconectado
	}
	screenAudioSource = null;
}

async function attachScreenAudio(stream: MediaStream): Promise<boolean> {
	detachScreenAudio();

	const screenTrack = stream.getAudioTracks().at(0);
	if (!screenTrack || !audioContext || !audioDestination) {
		return false;
	}

	try {
		screenAudioSource = audioContext.createMediaStreamSource(
			new MediaStream([screenTrack])
		);
		screenAudioSource.connect(audioDestination);

		if (audioContext.state === 'suspended') {
			await audioContext.resume().catch(() => {});
		}

		screenTrack.addEventListener(
			'ended',
			() => {
				if (state.localScreenStream === stream) {
					detachScreenAudio();
				}
			},
			{ once: true }
		);

		return true;
	} catch {
		detachScreenAudio();
		return false;
	}
}

function cleanupAudioMixer(): void {
	detachScreenAudio();

	if (micAudioSource) {
		try {
			micAudioSource.disconnect();
		} catch {
			// já desconectado
		}
		micAudioSource = null;
	}

	if (micGain) {
		try {
			micGain.disconnect();
		} catch {
			// já desconectado
		}
		micGain = null;
	}

	outboundAudioTrack?.stop();
	outboundAudioTrack = null;
	audioDestination = null;
	localAudioSender = null;
	micMuted = true;

	if (audioContext) {
		void audioContext.close().catch(() => {});
		audioContext = null;
	}
}

async function tuneVideoSender(
	sender: RTCRtpSender,
	kind: 'camera' | 'screen'
): Promise<void> {
	const params = sender.getParameters();
	if (!params.encodings || params.encodings.length === 0) {
		params.encodings = [{}];
	}

	const encoding = params.encodings[0];
	encoding.maxBitrate = kind === 'screen' ? 8_000_000 : 3_000_000;
	encoding.maxFramerate = 30;
	encoding.scaleResolutionDownBy = 1;

	try {
		await sender.setParameters(params);
	} catch {
		// Alguns browsers só aceitam certos campos depois da negociação.
	}

	const track = sender.track;
	if (!track) return;

	try {
		track.contentHint = kind === 'screen' ? 'detail' : 'motion';
	} catch {
		// contentHint é best-effort.
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
					width: { ideal: 1280, max: 1920 },
					height: { ideal: 720, max: 1080 },
					frameRate: { ideal: 30, min: 24, max: 30 }
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
			await tuneVideoSender(cameraTransceiver.sender, 'camera');
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
				// Quando o browser/OS suporta áudio de aba ou sistema, a opção
				// aparece no seletor nativo de compartilhamento.
				audio: true,
				video: {
					// getDisplayMedia não aceita constraints min/exact.
					// Deixamos o browser capturar na resolução nativa da fonte
					// e apenas pedimos até 30 FPS; bitrate/resolução de envio são
					// controlados no RTCRtpSender abaixo.
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
			await tuneVideoSender(screenTransceiver.sender, 'screen');
			await attachScreenAudio(stream);
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
				detachScreenAudio();
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
			detachScreenAudio();
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

	// voice-not-found can be a transient track_subscribe race: the publisher
	// announces camera/screen intent before the negotiated track reaches the
	// SFU. Subscription retries handle that case without aborting an unrelated
	// local offer.
	if (ev.code !== 'voice-not-found') {
		state.lastError = ev.message;
	}

	if (
		pendingAnswer &&
		(ev.code === 'voice-codec-unsupported' ||
			ev.code === 'voice-invalid-sdp' ||
			ev.code === 'voice-forbidden' ||
			ev.code === 'voice-room-closed')
	) {
		clearPendingAnswer(new Error(ev.message));
	}
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

function sendSubscription(
	key: string,
	userId: string,
	kind: VoiceMediaKind
): void {
	if (!currentChannelId || !remoteSubscriptions.has(key)) return;

	wsSend({
		type: 'track_subscribe',
		channel_id: currentChannelId,
		publisher_id: userId,
		kind
	} as WsInbound);
}

function subscriptionParts(key: string): { userId: string; kind: VoiceMediaKind } | null {
	const split = key.lastIndexOf(':');
	if (split <= 0) return null;
	const userId = key.slice(0, split);
	const kind = key.slice(split + 1);
	if (kind !== 'video' && kind !== 'screen') return null;
	return { userId, kind };
}

function releaseRemoteSubscription(key: string, notifyServer = true): void {
	if (!remoteSubscriptions.has(key)) return;

	const slot = remoteSubscriptions.get(key);
	const parts = subscriptionParts(key);

	if (notifyServer && parts && currentChannelId) {
		wsSend({
			type: 'track_unsubscribe',
			channel_id: currentChannelId,
			publisher_id: parts.userId,
			kind: parts.kind
		} as WsInbound);
	}

	remoteSubscriptions.delete(key);
	if (slot) slot.assignmentKey = null;
	state.remoteMedia.delete(key);
}

function reconcileRemoteVideoSubscriptions(): void {
	if (!currentChannelId || !peer || !mediaSubscriptionsReady) return;

	const desired = desiredRemoteMedia();
	const wanted = new Set(desired.map((item) => item.key));

	for (const key of [...remoteSubscriptions.keys()]) {
		if (!wanted.has(key)) {
			releaseRemoteSubscription(key);
		}
	}

	for (const item of desired) {
		if (remoteSubscriptions.has(item.key)) continue;

		const slot = remoteVideoSlots.find((candidate) => candidate.assignmentKey === null) ?? null;

		if (slot) {
			slot.assignmentKey = item.key;
			state.remoteMedia.set(item.key, {
				key: item.key,
				userId: item.userId,
				kind: item.kind,
				stream: slot.stream
			});
		}

		// Subscribe even before the browser has emitted ontrack for that SFU
		// slot. The first RTP packet is what makes the receiver track observable.
		remoteSubscriptions.set(item.key, slot);
		sendSubscription(item.key, item.userId, item.kind);
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

	remoteSubscriptions.clear();
	remoteVideoSlots.length = 0;
	state.remoteMedia.clear();
}

// ── ontrack: remote audio + local per-user controls ──────

const remoteAudios = new SvelteMap<string, HTMLAudioElement>();
// O elemento continua keyed por MID (estável por transceiver).
const remoteAudioTransceivers = new Map<string, RTCRtpTransceiver>();
// Alias do identificador de slot enviado pelo backend -> MID local.
const remoteAudioTrackKeys = new Map<string, string>();

function isReceivingAudio(transceiver: RTCRtpTransceiver): boolean {
	const direction = transceiver.currentDirection ?? transceiver.direction;
	return transceiver.receiver.track.kind === 'audio' && direction.includes('recv');
}

function audioSlotIdForTransceiver(transceiver: RTCRtpTransceiver): string | null {
	if (!peer) return null;

	const receivers = peer
		.getTransceivers()
		.filter(isReceivingAudio)
		.sort((a, b) => {
			const am = Number(a.mid);
			const bm = Number(b.mid);
			if (Number.isFinite(am) && Number.isFinite(bm)) return am - bm;
			return String(a.mid ?? '').localeCompare(String(b.mid ?? ''));
		});

	const index = receivers.indexOf(transceiver);
	return index >= 0 ? `papo-audio-${index}` : null;
}

function refreshRemoteAudioBindings(): void {
	remoteAudioTrackKeys.clear();

	for (const [key, audio] of remoteAudios) {
		const track = (audio.srcObject as MediaStream | null)?.getAudioTracks().at(0);
		const transceiver = remoteAudioTransceivers.get(key);
		if (!track || !transceiver) continue;

		// Preferência direta quando o browser preserva o msid/track id do SFU.
		remoteAudioTrackKeys.set(track.id, key);
		if (track.label) remoteAudioTrackKeys.set(track.label, key);

		// Fallback determinístico: os tracks do backend são criados em ordem
		// papo-audio-N e ocupam, nessa mesma ordem, os transceivers recv de áudio.
		const slotId = audioSlotIdForTransceiver(transceiver);
		if (slotId) remoteAudioTrackKeys.set(slotId, key);
	}
}

function applyRemoteAudioPreferencesForTrack(trackId: string): void {
	const key = remoteAudioTrackKeys.get(trackId);
	if (!key) return;

	const audio = remoteAudios.get(key);
	const userId = state.remoteAudioRoutes.get(trackId);
	if (!audio || !userId) return;

	audio.volume = state.remoteUserVolumes.get(userId) ?? 1;
	audio.muted = state.remoteUserMuted.get(userId) ?? false;
}

function applyRemoteAudioPreferencesForUser(userId: string): void {
	for (const [trackId, publisherId] of state.remoteAudioRoutes) {
		if (publisherId === userId) {
			applyRemoteAudioPreferencesForTrack(trackId);
		}
	}
}

function applyAllRemoteAudioPreferences(): void {
	for (const trackId of state.remoteAudioRoutes.keys()) {
		applyRemoteAudioPreferencesForTrack(trackId);
	}
}

export function remoteUserVolume(userId: string): number {
	return state.remoteUserVolumes.get(userId) ?? 1;
}

export function remoteUserMuted(userId: string): boolean {
	return state.remoteUserMuted.get(userId) ?? false;
}

export function setRemoteUserVolume(userId: string, volume: number): void {
	const next = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1));
	state.remoteUserVolumes.set(userId, next);
	applyRemoteAudioPreferencesForUser(userId);
}

export function setRemoteUserMuted(userId: string, muted: boolean): void {
	state.remoteUserMuted.set(userId, muted);
	applyRemoteAudioPreferencesForUser(userId);
}

export function toggleRemoteUserMuted(userId: string): void {
	setRemoteUserMuted(userId, !remoteUserMuted(userId));
}

function cleanupRemoteAudio(): void {
	for (const audio of remoteAudios.values()) {
		audio.pause();
		audio.srcObject = null;
		audio.remove();
	}

	remoteAudios.clear();
	remoteAudioTransceivers.clear();
	remoteAudioTrackKeys.clear();
	state.remoteAudioRoutes.clear();
	state.remoteUserVolumes.clear();
	state.remoteUserMuted.clear();
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

			// A subscribe can precede ontrack. Match the first still-unbound
			// subscription to the SFU slot that just started producing RTP.
			const pendingKey = [...remoteSubscriptions.entries()].find(
				([, assigned]) => assigned === null
			)?.[0];
			if (pendingKey) {
				slot.assignmentKey = pendingKey;
				remoteSubscriptions.set(pendingKey, slot);

				const parts = subscriptionParts(pendingKey);
				if (parts) {
					state.remoteMedia.set(pendingKey, {
						key: pendingKey,
						userId: parts.userId,
						kind: parts.kind,
						stream: slot.stream
					});
				}
			}
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
	remoteAudioTransceivers.set(mid, event.transceiver);
	refreshRemoteAudioBindings();
	applyAllRemoteAudioPreferences();

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
			remoteAudioTransceivers.delete(mid);
			refreshRemoteAudioBindings();
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

const DB_NAME = 'papo-client-media';
const DB_VERSION = 1;
const STORE = 'notification-sounds';
const DEFAULT_SOUND_URL = '/msn-sound.mp3';
const MAX_SOUND_BYTES = 8 * 1024 * 1024;

type SoundRecord = {
	userId: string;
	name: string;
	type: string;
	blob: Blob;
};

export type NotificationSoundInfo = {
	name: string;
	type: string;
	custom: boolean;
};

let audioContext: AudioContext | null = null;
let mediaPlayer: HTMLAudioElement | null = null;
let mediaPlayerObjectUrl: string | null = null;
let preparedUserId: string | null = null;
let preparedBuffer: AudioBuffer | null = null;
let prepareGeneration = 0;
let unlockInstalled = false;
let mediaUnlocked = false;
let pendingUserId: string | null = null;

function getAudioContext(): AudioContext | null {
	if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;

	if (!audioContext || audioContext.state === 'closed') {
		audioContext = new AudioContext();
	}

	return audioContext;
}

function getMediaPlayer(): HTMLAudioElement | null {
	if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

	if (!mediaPlayer) {
		mediaPlayer = new Audio();
		mediaPlayer.preload = 'auto';
		mediaPlayer.playsInline = true;
	}

	return mediaPlayer;
}

function setMediaPlayerSource(record: SoundRecord | null): void {
	const audio = getMediaPlayer();
	if (!audio) return;

	audio.pause();
	audio.currentTime = 0;

	if (mediaPlayerObjectUrl) {
		URL.revokeObjectURL(mediaPlayerObjectUrl);
		mediaPlayerObjectUrl = null;
	}

	if (record) {
		mediaPlayerObjectUrl = URL.createObjectURL(record.blob);
		audio.src = mediaPlayerObjectUrl;
	} else {
		audio.src = DEFAULT_SOUND_URL;
	}

	audio.load();
}

function openDb(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === 'undefined') return Promise.resolve(null);

	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE, { keyPath: 'userId' });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error ?? new Error('Falha ao abrir armazenamento local.'));
	});
}

async function getRecord(userId: string): Promise<SoundRecord | null> {
	const db = await openDb();
	if (!db) return null;

	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readonly');
		const req = tx.objectStore(STORE).get(userId);
		req.onsuccess = () => resolve((req.result as SoundRecord | undefined) ?? null);
		req.onerror = () => reject(req.error ?? new Error('Falha ao ler som de notificação.'));
		tx.oncomplete = () => db.close();
		tx.onerror = () => {
			db.close();
			reject(tx.error ?? new Error('Falha ao ler som de notificação.'));
		};
	});
}

async function defaultSoundBytes(): Promise<ArrayBuffer> {
	const response = await fetch(DEFAULT_SOUND_URL, {
		cache: 'force-cache',
		credentials: 'same-origin'
	});

	if (!response.ok) {
		throw new Error(`Falha ao carregar som padrão: ${response.status}`);
	}

	return response.arrayBuffer();
}

// Decode the selected sound ahead of time. When a WebSocket notification
// arrives there is no IndexedDB/fetch/decode work left in the playback path.
export async function prepareNotificationSound(userId: string): Promise<void> {
	const ctx = getAudioContext();
	if (!ctx) return;

	const generation = ++prepareGeneration;
	const record = await getRecord(userId);
	const bytes = record ? await record.blob.arrayBuffer() : await defaultSoundBytes();
	const buffer = await ctx.decodeAudioData(bytes.slice(0));

	if (generation !== prepareGeneration) return;

	preparedUserId = userId;
	preparedBuffer = buffer;
	setMediaPlayerSource(record);
}

function playPreparedBuffer(ctx: AudioContext): boolean {
	if (!preparedBuffer) return false;

	const source = ctx.createBufferSource();
	source.buffer = preparedBuffer;
	source.connect(ctx.destination);
	source.start(0);
	return true;
}

// Chrome requires AudioContext.resume() to happen from a real user gesture.
// Resume the exact context used for notifications on the first interaction.
export function installNotificationSoundUnlock(): void {
	if (typeof window === 'undefined' || unlockInstalled) return;
	unlockInstalled = true;

	const unlock = () => {
		const ctx = getAudioContext();
		const audio = getMediaPlayer();

		if (ctx) {
			void ctx.resume().catch((err) => {
				console.warn('[notification-sound] AudioContext unlock failed', err);
			});
		}

		if (!audio || mediaUnlocked) return;

		const previousVolume = audio.volume;
		audio.volume = 0.0001;
		audio.currentTime = 0;

		void audio
			.play()
			.then(() => {
				audio.pause();
				audio.currentTime = 0;
				audio.volume = previousVolume;
				mediaUnlocked = true;

				window.removeEventListener('pointerdown', unlock, true);
				window.removeEventListener('keydown', unlock, true);
				window.removeEventListener('touchstart', unlock, true);

				const userId = pendingUserId;
				pendingUserId = null;
				if (userId) void playNotificationSound(userId);
			})
			.catch((err) => {
				audio.volume = previousVolume;
				console.warn('[notification-sound] HTMLAudio unlock failed', err);
			});
	};

	window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
	window.addEventListener('keydown', unlock, { capture: true });
	window.addEventListener('touchstart', unlock, { capture: true, passive: true });
}

installNotificationSoundUnlock();

export async function notificationSoundInfo(userId: string): Promise<NotificationSoundInfo> {
	const record = await getRecord(userId);
	if (!record) {
		return { name: 'MSN padrão', type: 'audio/mpeg', custom: false };
	}
	return { name: record.name, type: record.type, custom: true };
}

export async function setNotificationSound(userId: string, file: File): Promise<void> {
	const type = file.type || (file.name.toLowerCase().endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg');
	if (!['audio/mpeg', 'audio/mp3', 'audio/ogg'].includes(type)) {
		throw new Error('Use um arquivo MP3 ou OGG.');
	}
	if (file.size <= 0 || file.size > MAX_SOUND_BYTES) {
		throw new Error('O som precisa ter até 8 MB.');
	}

	const db = await openDb();
	if (!db) throw new Error('Este navegador não suporta armazenamento local de áudio.');

	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put({
			userId,
			name: file.name,
			type,
			blob: file
		} satisfies SoundRecord);
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error ?? new Error('Falha ao salvar som de notificação.'));
		};
	});

	await prepareNotificationSound(userId);
}

export async function clearNotificationSound(userId: string): Promise<void> {
	const db = await openDb();
	if (!db) return;

	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).delete(userId);
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onerror = () => {
			db.close();
			reject(tx.error ?? new Error('Falha ao restaurar som padrão.'));
		};
	});

	await prepareNotificationSound(userId);
}

async function playMediaFallback(): Promise<boolean> {
	const audio = getMediaPlayer();
	if (!audio) return false;

	try {
		audio.pause();
		audio.currentTime = 0;
		audio.volume = 1;
		await audio.play();
		return true;
	} catch (err) {
		console.warn('[notification-sound] HTMLAudio playback failed', err);
		return false;
	}
}

export async function playNotificationSound(userId: string): Promise<boolean> {
	const ctx = getAudioContext();

	try {
		if (preparedUserId !== userId || !preparedBuffer) {
			await prepareNotificationSound(userId);
		}

		// Chrome may suspend Web Audio for background tabs without rejecting
		// resume(). Prefer it when running, then fall back to a persistent
		// HTMLMediaElement which is handled differently by Chrome.
		if (ctx) {
			if (ctx.state !== 'running') {
				try {
					await ctx.resume();
				} catch {
					// fall through to HTMLAudio
				}
			}

			if (ctx.state === 'running' && playPreparedBuffer(ctx)) {
				return true;
			}
		}

		const played = await playMediaFallback();
		if (!played) pendingUserId = userId;
		return played;
	} catch (err) {
		console.warn('[notification-sound] playback failed', err);
		pendingUserId = userId;
		return false;
	}
}

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
let preparedUserId: string | null = null;
let preparedBuffer: AudioBuffer | null = null;
let prepareGeneration = 0;
let unlockInstalled = false;
let pendingUserId: string | null = null;

function getAudioContext(): AudioContext | null {
	if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;

	if (!audioContext || audioContext.state === 'closed') {
		audioContext = new AudioContext();
	}

	return audioContext;
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
		if (!ctx) return;

		void ctx
			.resume()
			.then(() => {
				if (ctx.state !== 'running') return;

				window.removeEventListener('pointerdown', unlock, true);
				window.removeEventListener('keydown', unlock, true);
				window.removeEventListener('touchstart', unlock, true);

				const userId = pendingUserId;
				pendingUserId = null;
				if (userId) {
					void playNotificationSound(userId);
				}
			})
			.catch((err) => {
				console.warn('[notification-sound] Chrome audio unlock failed', err);
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

export async function playNotificationSound(userId: string): Promise<boolean> {
	const ctx = getAudioContext();
	if (!ctx) return false;

	// Important for Chrome: resume is attempted before any other await. When
	// this function is called by the "Testar" button, the call is still inside
	// the user activation event.
	if (ctx.state !== 'running') {
		try {
			await ctx.resume();
		} catch (err) {
			pendingUserId = userId;
			console.warn('[notification-sound] playback blocked until user interaction', err);
			return false;
		}
	}

	try {
		if (preparedUserId !== userId || !preparedBuffer) {
			await prepareNotificationSound(userId);
		}

		if (ctx.state !== 'running') {
			pendingUserId = userId;
			return false;
		}

		return playPreparedBuffer(ctx);
	} catch (err) {
		console.warn('[notification-sound] playback failed', err);
		return false;
	}
}

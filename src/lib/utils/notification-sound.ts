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

let player: HTMLAudioElement | null = null;
let preparedUserId: string | null = null;
let playerObjectUrl: string | null = null;
let unlockInstalled = false;
let unlocked = false;
let pendingPlay = false;

function getPlayer(): HTMLAudioElement | null {
	if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
	if (!player) {
		player = new Audio(DEFAULT_SOUND_URL);
		player.preload = 'auto';
		player.playsInline = true;
	}
	return player;
}

function revokePlayerObjectUrl(): void {
	if (!playerObjectUrl) return;
	URL.revokeObjectURL(playerObjectUrl);
	playerObjectUrl = null;
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

// Preload the current user's source before a notification arrives. This keeps
// Chrome's actual notification playback free of IndexedDB/fetch awaits.
export async function prepareNotificationSound(userId: string): Promise<void> {
	const audio = getPlayer();
	if (!audio) return;

	const record = await getRecord(userId);
	audio.pause();
	audio.currentTime = 0;
	revokePlayerObjectUrl();

	if (record) {
		playerObjectUrl = URL.createObjectURL(record.blob);
		audio.src = playerObjectUrl;
	} else {
		audio.src = DEFAULT_SOUND_URL;
	}

	preparedUserId = userId;
	audio.load();
}

// Chrome blocks audible playback until the origin receives a user gesture.
// Prime the same persistent media element used by notifications. A tiny volume
// avoids an audible click while still exercising the audible media path.
export function installNotificationSoundUnlock(): void {
	if (typeof window === 'undefined' || unlockInstalled) return;
	unlockInstalled = true;

	const unlock = () => {
		const audio = getPlayer();
		if (!audio || unlocked) return;

		const previousVolume = audio.volume;
		audio.volume = 0.0001;
		audio.currentTime = 0;

		void audio
			.play()
			.then(() => {
				audio.pause();
				audio.currentTime = 0;
				audio.volume = previousVolume;
				unlocked = true;
				window.removeEventListener('pointerdown', unlock, true);
				window.removeEventListener('keydown', unlock, true);
				window.removeEventListener('touchstart', unlock, true);
				if (pendingPlay) {
					pendingPlay = false;
					queueMicrotask(() => {
						void playPrepared();
					});
				}
			})
			.catch(() => {
				audio.volume = previousVolume;
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

async function playPrepared(): Promise<boolean> {
	const audio = getPlayer();
	if (!audio) return false;

	try {
		audio.pause();
		audio.currentTime = 0;
		audio.volume = 1;
		await audio.play();
		return true;
	} catch (err) {
		if (err instanceof DOMException && err.name === 'NotAllowedError') {
			pendingPlay = true;
		}
		return false;
	}
}

export async function playNotificationSound(userId: string): Promise<boolean> {
	try {
		if (preparedUserId !== userId) {
			await prepareNotificationSound(userId);
		}
		return await playPrepared();
	} catch {
		return false;
	}
}

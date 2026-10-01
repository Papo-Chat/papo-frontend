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
}

export async function playNotificationSound(userId: string): Promise<boolean> {
	if (typeof Audio === 'undefined') return false;

	let objectUrl: string | null = null;
	try {
		const record = await getRecord(userId);
		const src = record
			? (objectUrl = URL.createObjectURL(record.blob))
			: DEFAULT_SOUND_URL;
		const audio = new Audio(src);
		audio.preload = 'auto';
		await audio.play();
		if (objectUrl) {
			const url = objectUrl;
			const cleanup = () => URL.revokeObjectURL(url);
			audio.addEventListener('ended', cleanup, { once: true });
			audio.addEventListener('error', cleanup, { once: true });
		}
		return true;
	} catch {
		if (objectUrl) URL.revokeObjectURL(objectUrl);
		return false;
	}
}

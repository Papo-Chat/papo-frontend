// User-provided KLIPY key is kept locally per Papo account and never sent to the Papo API.
const STORAGE_PREFIX = 'papo:klipy-api-key:';

export const state = $state({
	userId: null as string | null,
	apiKey: ''
});

function storageKey(userId: string): string {
	return STORAGE_PREFIX + encodeURIComponent(userId);
}

function readApiKey(userId: string): string {
	if (typeof window === 'undefined') return '';
	try {
		return window.localStorage.getItem(storageKey(userId))?.trim() ?? '';
	} catch {
		return '';
	}
}

export function loadForUser(userId: string): void {
	if (!userId) {
		reset();
		return;
	}
	if (state.userId === userId) return;
	state.userId = userId;
	state.apiKey = readApiKey(userId);
}

export function setApiKey(userId: string, apiKey: string): void {
	if (typeof window === 'undefined') {
		throw new Error('O armazenamento local não está disponível.');
	}
	const normalized = apiKey.trim();
	try {
		if (normalized) {
			window.localStorage.setItem(storageKey(userId), normalized);
		} else {
			window.localStorage.removeItem(storageKey(userId));
		}
	} catch {
		throw new Error('Não foi possível salvar a chave no armazenamento local do navegador.');
	}
	state.userId = userId;
	state.apiKey = normalized;
}

export function reset(): void {
	state.userId = null;
	state.apiKey = '';
}

// Background store — user wallpaper, persisted in localStorage.
// Applied via the inline --user-background on <html>, which both the
// picker and the settings page share (theme.css holds the fallback).

import { writable } from 'svelte/store';

export interface DeviceImage {
	id: string;
	label: string;
	background: string;
}

// Preview for the "Padrão" option (matches --user-background in theme.css).
export const defaultBackground =
	'linear-gradient(125deg, #062f75 0%, #0080ba 48%, #0a8067 100%)';

const KEY = 'papo:background';
const IMAGE_KEY = 'papo:user-image';

// Custom (user-uploaded) background id. The image itself is stored as a data
// URL in localStorage, separate from the preset list below.
export const CUSTOM_BG_ID = 'custom';

export const deviceImages: DeviceImage[] = [
	{ id: 'default', label: 'Padrão', background: '' },
	{
		id: 'midnight-rose',
		label: 'Rosa Noturna',
		background: 'linear-gradient(135deg, #1f1638 0%, #6d2e5b 48%, #d9778a 100%)'
	},
	{
		id: 'forest',
		label: 'Floresta',
		background: 'linear-gradient(135deg, #1b4332 0%, #2d6a4f 48%, #40916c 100%)'
	},
	{
		id: 'sunset',
		label: 'Pôr do Sol',
		background: 'linear-gradient(135deg, #ff9a6d 0%, #ff6b6b 48%, #c44569 100%)'
	},
	{
		id: 'space',
		label: 'Espaço',
		background: 'linear-gradient(135deg, #0f2027 0%, #203a43 48%, #2c5364 100%)'
	},
	{
		id: 'desert',
		label: 'Deserto',
		background: 'linear-gradient(135deg, #e9c46a 0%, #f4a261 48%, #e76f51 100%)'
	},
	{
		id: 'aurora',
		label: 'Aurora',
		background: 'linear-gradient(135deg, #7209b7 0%, #3a0ca3 48%, #4cc9f0 100%)'
	}
];

// User-uploaded background limits (PNG/JPEG only — user requirement).
const MAX_USER_BG_BYTES = 2 * 1024 * 1024;
const ALLOWED_USER_BG_MIMES = ['image/png', 'image/jpeg'] as const;

// Pure (node-testable): validates a user-uploaded background image.
// Returns '' when valid or a pt-BR error message to display.
export function validateUserBgFile(file: { size: number; type: string }): string {
	let err = '';
	if (!(ALLOWED_USER_BG_MIMES as readonly string[]).includes(file.type)) {
		err += 'tipo inválido; use PNG, JPEG ou JPG';
	}
	if (file.size > MAX_USER_BG_BYTES) {
		err += `${err ? '; ' : ''}excede o tamanho máximo de 2MB`;
	}
	return err;
}

function read(): string {
	if (typeof window === 'undefined') {
		return 'default';
	}
	const stored = window.localStorage.getItem(KEY);
	return stored ? stored : 'default';
}

function readUserImage(): string {
	if (typeof window === 'undefined') {
		return '';
	}
	return window.localStorage.getItem(IMAGE_KEY) ?? '';
}

// Applies the selected background to <html>: presets via --user-background,
// custom images as a data-URL image. The .has-user-image class makes CSS
// stretch+fill the image (see theme.css).
function applyToDom(id: string): void {
	if (typeof window === 'undefined') {
		return;
	}
	const el = document.documentElement;
	if (id === CUSTOM_BG_ID) {
		const url = readUserImage();
		el.classList.toggle('has-user-image', Boolean(url));
		if (url) {
			el.style.setProperty('--user-background', `url("${url}")`);
		} else {
			el.style.removeProperty('--user-background');
		}
		return;
	}
	const img = deviceImages.find((d) => d.id === id);
	if (img?.background) {
		el.style.setProperty('--user-background', img.background);
	} else {
		el.style.removeProperty('--user-background');
	}
	el.classList.remove('has-user-image');
}

const initial = read();
applyToDom(initial);

export const backgroundId = writable<string>(initial);
export const userImageUrl = writable<string>(
	initial === CUSTOM_BG_ID ? readUserImage() : ''
);

export function setBackground(next: string): void {
	backgroundId.set(next);
	applyToDom(next);
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(KEY, next);
	}
}

// Validates + reads a user-uploaded image, persists it to localStorage as a
// data URL and selects it. Returns '' on success or an error message.
export async function setUserBackground(file: File): Promise<string> {
	const err = validateUserBgFile(file);
	if (err) {
		return err;
	}
	if (typeof window === 'undefined') {
		return 'ambiente sem navegador';
	}

	let dataUrl = '';
	try {
		await new Promise<void>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				dataUrl = String(reader.result ?? '');
				resolve();
			};
			reader.onerror = () => reject(new Error('falha ao ler a imagem'));
			reader.readAsDataURL(file);
		});
	} catch (e) {
		return e instanceof Error ? e.message : 'falha ao ler a imagem';
	}

	if (!dataUrl) {
		return 'falha ao ler a imagem';
	}

	try {
		window.localStorage.setItem(IMAGE_KEY, dataUrl);
	} catch {
		console.error('papo: failed to persist user background image');
		return 'falha ao salvar a imagem no armazenamento local';
	}

	userImageUrl.set(dataUrl);
	setBackground(CUSTOM_BG_ID);
	return '';
}

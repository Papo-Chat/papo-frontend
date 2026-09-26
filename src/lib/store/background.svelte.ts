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

function read(): string {
	if (typeof window === 'undefined') {
		return 'default';
	}
	const stored = window.localStorage.getItem(KEY);
	return stored ? stored : 'default';
}

function applyToDom(id: string): void {
	if (typeof window === 'undefined') {
		return;
	}
	const img = deviceImages.find((d) => d.id === id);
	const el = document.documentElement;
	if (img?.background) {
		el.style.setProperty('--user-background', img.background);
	} else {
		el.style.removeProperty('--user-background');
	}
}

const initial = read();
applyToDom(initial);

export const backgroundId = writable<string>(initial);

export function setBackground(next: string): void {
	backgroundId.set(next);
	applyToDom(next);
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(KEY, next);
	}
}

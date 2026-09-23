// Theme store — light/dark mode, persisted in localStorage.
// Falls back to the OS preference when no explicit value is stored.

import { writable } from 'svelte/store';

export type ThemeMode = 'light' | 'dark';

const KEY = 'papo:theme';

function read(): ThemeMode {
	if (typeof window === 'undefined') {
		return 'light';
	}
	const stored = window.localStorage.getItem(KEY);
	if (stored === 'light' || stored === 'dark') {
		return stored;
	}
	return window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light';
}

function applyToDom(mode: ThemeMode): void {
	if (typeof window === 'undefined') {
		return;
	}
	const root = document.documentElement;
	if (mode === 'dark') {
		root.setAttribute('data-theme', 'dark');
	} else {
		root.removeAttribute('data-theme');
	}
}

const initial = read();
applyToDom(initial);

export const theme = writable<ThemeMode>(initial);

export function setTheme(next: ThemeMode): void {
	theme.set(next);
	applyToDom(next);
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(KEY, next);
	}
}

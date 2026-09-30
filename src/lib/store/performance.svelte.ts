// Lightweight UI mode.
//
// Mobile always uses the flat rendering path. Desktop users can opt into the
// same lower-cost rendering mode; the preference is local to the device.

import { writable } from 'svelte/store';

const KEY = 'papo:flat-ui';
const MOBILE_QUERY = '(max-width: 700px)';

function readPreference(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}
	return window.localStorage.getItem(KEY) === 'true';
}

let preference = readPreference();

export const flatUi = writable<boolean>(preference);
export const mobileFlatUi = writable<boolean>(false);

function applyToDom(): void {
	if (typeof window === 'undefined') {
		return;
	}

	const mobile = window.matchMedia(MOBILE_QUERY).matches;
	const enabled = mobile || preference;
	const root = document.documentElement;

	root.toggleAttribute('data-ui-flat', enabled);
	root.toggleAttribute('data-ui-mobile', mobile);
	mobileFlatUi.set(mobile);
}

export function setFlatUi(next: boolean): void {
	preference = next;
	flatUi.set(next);
	if (typeof window !== 'undefined') {
		window.localStorage.setItem(KEY, String(next));
	}
	applyToDom();
}

if (typeof window !== 'undefined') {
	const media = window.matchMedia(MOBILE_QUERY);
	applyToDom();
	media.addEventListener('change', applyToDom);
}

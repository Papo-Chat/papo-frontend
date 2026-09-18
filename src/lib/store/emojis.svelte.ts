// Emojis store: the emoji list (keyset, 25/page) plus create/remove.

import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api';
import { nextCursor } from '../utils/keyset';
import { blobToUrl } from '../utils/media';
import type { Emoji, KeysetCursor } from '../types';

export const state = $state({
	byId: new SvelteMap<string, Emoji>(),
	list: [] as Emoji[],
	loaded: false,
	loading: false,
	hasMore: false,
	cursor: null as KeysetCursor | null,
});

async function _loadPage(q?: { since?: string; last_id?: string }): Promise<void> {
	state.loading = true;
	try {
		const res = await api.emojis.list(q);
		for (const e of res.emojis) {
			state.byId.set(e.id, e);
		}
		state.list = [...state.list, ...res.emojis];
		state.hasMore = res.has_more;
		state.cursor = nextCursor(res.emojis) ?? null;
		state.loaded = true;
	} finally {
		state.loading = false;
	}
}

export function load(): void {
	// Fresh load: reset the list.
	state.list = [];
	_loadPage();
}

export function loadMore(): void {
	if (!state.cursor) {
		return;
	}
	_loadPage({
		since: state.cursor.since,
		last_id: state.cursor.last_id,
	});
}

export function create(req: { name: string; format: string; image_blob: string }): void {
	api.emojis
		.create(req)
		.then((e) => {
			state.byId.set(e.id, e);
			state.list = [...state.list, e];
		});
}

export function remove(id: string): void {
	api.emojis
		.remove(id)
		.then(() => {
			state.byId.delete(id);
			state.list = state.list.filter((e) => e.id !== id);
		});
}

// base64 → objectURL (cached).
export function emojiUrl(emoji: Emoji): string {
	if (!emoji.image_blob) {
		return '';
	}
	return blobToUrl(emoji.image_blob, emoji.format);
}

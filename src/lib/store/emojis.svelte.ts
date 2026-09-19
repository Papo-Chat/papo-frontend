// Emojis store: the emoji list (keyset, 25/page) plus create/remove.

import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api';
import { currentSessionEpoch, isCurrentSessionEpoch } from '../utils/session-epoch';
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
	// Guards against concurrent load/loadMore (P1.11).
	loadGeneration: 0
});

async function _loadPage(q?: { since?: string; last_id?: string }): Promise<void> {
	const gen = (state.loadGeneration += 1);
	state.loading = true;
	try {
		const res = await api.emojis.list(q);
		// Discard if a newer load/loadMore started in the meantime (P1.11).
		if (state.loadGeneration !== gen) {
			return;
		}
		for (const e of res.emojis) {
			state.byId.set(e.id, e);
		}
		if (q) {
			// loadMore: append, deduping by id.
			const seen = new Set(state.list.map((e) => e.id));
			const fresh = res.emojis.filter((e) => !seen.has(e.id));
			state.list = [...state.list, ...fresh];
		} else {
			// load: replace.
			state.list = res.emojis;
		}
		state.hasMore = res.has_more;
		state.cursor = nextCursor(res.emojis) ?? null;
		state.loaded = true;
	} finally {
		if (state.loadGeneration === gen) {
			state.loading = false;
		}
	}
}

export function load(): void {
	// Fresh load: reset the list.
	state.list = [];
	_loadPage();
}

export function loadMore(): void {
	// Guard: no in-flight page + a cursor to continue from (P1.11).
	if (state.loading || !state.cursor) {
		return;
	}
	_loadPage({
		since: state.cursor.since,
		last_id: state.cursor.last_id
	});
}

export function create(req: { name: string; format: string; image_blob: string }): void {
	const epoch = currentSessionEpoch();
	api.emojis.create(req).then((e) => {
		if (!isCurrentSessionEpoch(epoch)) {
			throw new Error('stale session');
		}
		state.byId.set(e.id, e);
		state.list = [...state.list, e];
	});
}

export function remove(id: string): void {
	const epoch = currentSessionEpoch();
	api.emojis.remove(id).then(() => {
		if (!isCurrentSessionEpoch(epoch)) {
			throw new Error('stale session');
		}
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

// Full reset (logout / 401 / account switch).
export function reset(): void {
	state.loadGeneration += 1;
	state.byId.clear();
	state.list = [];
	state.loaded = false;
	state.loading = false;
	state.hasMore = false;
	state.cursor = null;
}

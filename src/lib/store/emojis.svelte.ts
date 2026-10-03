// Emojis store: the emoji list (keyset, 25/page) plus create/remove.

import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api';
import { currentSessionEpoch, isCurrentSessionEpoch } from '../utils/session-epoch';
import { nextCursor } from '../utils/keyset';
import { blobToUrl, revokeBlobKey } from '../utils/media';
import type { Emoji, KeysetCursor } from '../types';

export const state = $state({
	byId: new SvelteMap<string, Emoji>(),
	byName: new SvelteMap<string, Emoji>(),
	list: [] as Emoji[],
	loaded: false,
	loading: false,
	fullyLoaded: false,
	hasMore: false,
	cursor: null as KeysetCursor | null,
	// Guards against concurrent load/loadMore (P1.11).
	loadGeneration: 0
});

function rebuildNameIndex(): void {
	state.byName.clear();
	for (const emoji of state.list) {
		state.byName.set(emoji.name, emoji);
	}
}

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
		rebuildNameIndex();
		state.hasMore = res.has_more;
		state.cursor = nextCursor(res.emojis) ?? null;
		state.loaded = true;
		state.fullyLoaded = !res.has_more;
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

export async function loadAll(): Promise<void> {
	const gen = (state.loadGeneration += 1);
	state.loading = true;
	state.loaded = true;
	state.fullyLoaded = false;

	const all: Emoji[] = [];
	const seen = new Set<string>();
	let cursor: KeysetCursor | null = null;
	let hasMore = true;

	try {
		while (hasMore) {
			const res = await api.emojis.list(
				cursor ? { since: cursor.since, last_id: cursor.last_id } : undefined
			);
			if (state.loadGeneration !== gen) return;

			for (const emoji of res.emojis) {
				state.byId.set(emoji.id, emoji);
				if (!seen.has(emoji.id)) {
					seen.add(emoji.id);
					all.push(emoji);
				}
			}

			// Publish each page so the picker becomes progressively complete.
			// Keep local create/remove mutations authoritative while pagination
			// is still walking older pages.
			const published = all.filter((emoji) => state.byId.has(emoji.id));
			const publishedIds = new Set(published.map((emoji) => emoji.id));
			for (const emoji of state.byId.values()) {
				if (!publishedIds.has(emoji.id)) {
					published.push(emoji);
					publishedIds.add(emoji.id);
				}
			}
			state.list = published;
			rebuildNameIndex();
			state.hasMore = res.has_more;
			cursor = nextCursor(res.emojis) ?? null;
			state.cursor = cursor;

			if (!res.has_more || !cursor || res.emojis.length === 0) {
				hasMore = false;
			}
		}

		if (state.loadGeneration === gen) {
			state.hasMore = false;
			state.cursor = null;
			state.fullyLoaded = true;
		}
	} finally {
		if (state.loadGeneration === gen) {
			state.loading = false;
		}
	}
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

export async function create(req: {
	name: string;
	format: string;
	image_blob: string;
}): Promise<Emoji> {
	const epoch = currentSessionEpoch();
	const emoji = await api.emojis.create(req);
	if (!isCurrentSessionEpoch(epoch)) {
		throw new Error('stale session');
	}
	state.byId.set(emoji.id, emoji);
	state.byName.set(emoji.name, emoji);
	state.list = [...state.list, emoji];
	return emoji;
}

export async function remove(id: string): Promise<void> {
	const epoch = currentSessionEpoch();
	await api.emojis.remove(id);
	if (!isCurrentSessionEpoch(epoch)) {
		throw new Error('stale session');
	}
	const removed = state.byId.get(id);
	state.byId.delete(id);
	if (removed && state.byName.get(removed.name)?.id === id) {
		state.byName.delete(removed.name);
	}
	revokeBlobKey(`emoji:${id}`);
	state.list = state.list.filter((e) => e.id !== id);
}

// Custom emoji images have a stable identity for the session. Reuse one
// object URL per emoji id so channel switches do not repeatedly parse large
// data: URLs or hash/decode the same base64 payload on every message mount.
export function emojiUrl(emoji: Emoji): string {
	if (!emoji.image_blob) {
		return '';
	}
	return blobToUrl(emoji.image_blob, emoji.format, `emoji:${emoji.id}`);
}

// Full reset (logout / 401 / account switch).
export function reset(): void {
	state.loadGeneration += 1;
	for (const id of state.byId.keys()) {
		revokeBlobKey(`emoji:${id}`);
	}
	state.byId.clear();
	state.byName.clear();
	state.list = [];
	state.loaded = false;
	state.loading = false;
	state.fullyLoaded = false;
	state.hasMore = false;
	state.cursor = null;
}

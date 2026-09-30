// Messages store: per-channel message caches (byId + ordered ids + pinned
// list) plus the pure WS reducer (applyEvent) and keyset loading.
//
// Reactivity rule: values in a reactive map are NOT deeply reactive, so any
// change replaces the affected object via `.set(key, newObj)` — never in-place
// mutation of a stored message.
//
// REST ↔ WS merge (P0.4): a delayed REST snapshot must never clobber a newer
// WS delta. Tombstones (`deletedMessageIds`, `previewTombstones`) mark
// messages/previews removed via WS; a late REST page must not resurrect them.
// `requestGeneration` discards a page that resolves after the channel was
// evicted/refreshed.

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { api } from '../api';
import { nextCursor } from '../utils/keyset';
import type { ChannelMessagesState, MessagesState } from './messages.types';
import type {
	LinkPreview,
	LinkPreviewWithImage,
	MessageWithAttachment,
	WsAttachmentModerationUpdate,
	WsLinkPreviewUpdate,
	WsMessage,
	WsNewPreview,
	WsOutbound,
	WsReactUpdate
} from '../types';

// ── window policy (P1.12) ───────────────────────────────
// Max messages kept per channel.
const MAX_WINDOW = 300;

// ── caches (module-level, non-reactive) ─────────────────
// Resolved previews (with image_data) keyed by preview_id. The message only
// keeps the preview metadata; image_data lives here for rendering.
const previewCache = new SvelteMap<string, LinkPreviewWithImage>();
// new_preview events whose message is not yet in the cache. Keyed by
// message_id (new_preview carries no channel_id). Applied when the message
// arrives in a channel, subject to the tombstone check.
const pendingPreviews = new SvelteMap<string, SvelteMap<string, LinkPreviewWithImage>>();

const previewTombstones = new SvelteSet<string>();

let requestSerial = 0;
let storeEpoch = 0;

function previewKey(messageId: string, previewId: string): string {
	return `${messageId}:${previewId}`;
}

function setPendingPreview(messageId: string, preview: LinkPreviewWithImage): void {
	let previews = pendingPreviews.get(messageId);

	if (!previews) {
		previews = new SvelteMap();
		pendingPreviews.set(messageId, previews);
	}

	previews.set(preview.id, preview);
}

function deletePendingPreview(messageId: string, previewId: string): void {
	const previews = pendingPreviews.get(messageId);
	if (!previews) return;

	previews.delete(previewId);

	if (previews.size === 0) {
		pendingPreviews.delete(messageId);
	}
}

// When messages leave the window (trim), release their client-side resources so
// they don't leak in the module-level caches.
//
// - previews (image_data, unbounded): drop from previewCache/pendingPreviews,
//   unless another message still in the window references the same preview id.
// - attachments/thumbnails: plain server URLs — nothing held in memory.
// - reactions / user_reactions: fields on the message object, freed with it.
// - reaction user lists (Reactions.svelte `cached`): component-local $state,
//   freed when the message's <Reactions> unmounts from the list.
function releaseMessageResources(
	byId: SvelteMap<string, MessageWithAttachment>,
	dropped: MessageWithAttachment[]
): void {
	if (dropped.length === 0) {
		return;
	}

	// Preview ids still referenced by messages kept in the window.
	const keptPreviewIds = new Set<string>();
	for (const m of byId.values()) {
		for (const p of m.previews) {
			keptPreviewIds.add(p.id);
		}
	}

	for (const m of dropped) {
		// Drop any not-yet-applied previews for this message.
		pendingPreviews.delete(m.id);
		for (const p of m.previews) {
			if (!keptPreviewIds.has(p.id)) {
				previewCache.delete(p.id);
			}
		}
	}
}

// ── state ─────────────────────────────────────────────────

function trimLatestWindow(
	ch: ChannelMessagesState,
	byId: SvelteMap<string, MessageWithAttachment>
): {
	byId: SvelteMap<string, MessageWithAttachment>;
	hasMoreOlder: boolean;
	cursorOlder: ChannelMessagesState['cursorOlder'];
} {
	if (byId.size <= MAX_WINDOW) {
		return {
			byId,
			hasMoreOlder: ch.hasMoreOlder,
			cursorOlder: ch.cursorOlder
		};
	}

	const ids = sortedIds(byId);
	const excess = ids.length - MAX_WINDOW;

	const dropped: MessageWithAttachment[] = [];
	for (const id of ids.slice(0, excess)) {
		const m = byId.get(id);
		if (m) dropped.push(m);
		byId.delete(id);
	}
	releaseMessageResources(byId, dropped);

	const keptIds = sortedIds(byId);
	const oldestId = keptIds[0];
	const oldest = oldestId ? byId.get(oldestId) : undefined;

	return {
		byId,
		hasMoreOlder: true,
		cursorOlder: oldest
			? {
					since: oldest.created_at,
					last_id: oldest.id
				}
			: null
	};
}

export const state = $state<MessagesState>({
	channels: new SvelteMap<string, ChannelMessagesState>()
});

function newChannelState(): ChannelMessagesState {
	return {
		byId: new SvelteMap<string, MessageWithAttachment>(),
		ids: [],
		loaded: false,
		loading: false,
		windowMode: 'latest',
		hasMoreOlder: false,
		hasMoreNewer: false,
		cursorOlder: null,
		requestGeneration: 0,
		deletedMessageIds: new Set<string>(),
		previewTombstones: new Set<string>(),
		pinned: [],
		pinnedLoaded: false,
		pinnedLoading: false,
		pinnedGeneration: 0
	};
}

// ── ordering helpers (pure) ───────────────────────────────

export function compareMessages(a: MessageWithAttachment, b: MessageWithAttachment): number {
	if (a.created_at !== b.created_at) {
		return a.created_at < b.created_at ? -1 : 1;
	}
	if (a.id !== b.id) {
		return a.id < b.id ? -1 : 1;
	}
	return 0;
}

export function sortedIds(byId: SvelteMap<string, MessageWithAttachment>): string[] {
	const msgs: MessageWithAttachment[] = [];
	for (const m of byId.values()) {
		msgs.push(m);
	}
	msgs.sort(compareMessages);
	return msgs.map((m) => m.id);
}

// Convert a WS `message` event (no reactions/previews/user_reactions) into a
// full MessageWithAttachment for the cache.
export function wsMessageToMsg(m: WsMessage): MessageWithAttachment {
	return {
		id: m.id,
		channel_id: m.channel_id,
		author_id: m.author_id,
		content: m.content,
		created_at: m.created_at,
		edited_at: null,
		reply_to: m.reply_to,
		attachments: m.attachments ?? [],
		previews: [],
		reactions: [],
		user_reactions: []
	};
}

// A API pode devolver `null` para campos de array opcionais (previews/reactions)
// — o contrato (openapi) trata `reactions` como nullable e, na prática,
// `previews` também chega null. A normalização converte para arrays vazios,
// preservando as invariantes de array não-nulo do store (merge, tombstones,
// trim).
function coerceMessage(m: MessageWithAttachment): MessageWithAttachment {
	return {
		...m,
		attachments: m.attachments ?? [],
		previews: m.previews ?? [],
		reactions: m.reactions ?? [],
		user_reactions: m.user_reactions ?? []
	};
}

// ── pure helpers (exported for tests) ─────────────────────

function replaceChannel(
	state: MessagesState,
	channelId: string,
	build: (old: ChannelMessagesState) => ChannelMessagesState
): void {
	const old = state.channels.get(channelId);
	if (!old) {
		return;
	}
	state.channels.set(channelId, build(old));
}

function isPreviewRemoved(ch: ChannelMessagesState, messageId: string, previewId: string): boolean {
	const key = previewKey(messageId, previewId);

	return previewTombstones.has(key) || ch.previewTombstones.has(key);
}

// Merge a REST `incoming` message into an existing local `existing` message,
// preserving WS deltas (reactions, user_reactions, previews, edits) that a
// stale REST snapshot must not clobber. Returns null when the message is
// tombstoned (deleted via WS) → never resurrect it.
export function mergeFetchedMessage(
	existing: MessageWithAttachment | undefined,
	incoming: MessageWithAttachment,
	ch: ChannelMessagesState
): MessageWithAttachment | null {
	const normalizedIncoming = coerceMessage(incoming);
	const normalizedExisting = existing ? coerceMessage(existing) : undefined;
	if (ch.deletedMessageIds.has(normalizedIncoming.id)) {
		return null;
	}
	const incomingSafe: MessageWithAttachment = {
		...normalizedIncoming,
		previews: normalizedIncoming.previews.filter((p) =>
			!isPreviewRemoved(ch, normalizedIncoming.id, p.id)
		)
	};
	if (!normalizedExisting) {
		// Not in the local cache: insert the REST message as-is.
		return incomingSafe;
	}
	// Exists locally: never blind-overwrite. Preserve WS deltas.
	const previewKey = (pid: string) => `${normalizedExisting.id}:${pid}`;
	const keptPreviews = normalizedExisting.previews.filter((p) => !ch.previewTombstones.has(previewKey(p.id)));
	const keptPreviewIds = new SvelteSet(keptPreviews.map((p) => p.id));
	const mergedPreviews: LinkPreview[] = [
		...keptPreviews,
		...incomingSafe.previews.filter((p) => !keptPreviewIds.has(p.id))
	];
	// Attachments: preserve a local (WS-moderation) status over a stale REST.
	const mergedAttachments = incomingSafe.attachments.map((a) => {
		const local = normalizedExisting.attachments.find((la) => la.id === a.id);
		if (local && local.moderation_status !== a.moderation_status) {
			return { ...a, moderation_status: local.moderation_status };
		}
		return a;
	});
	const merged: MessageWithAttachment = {
		...incomingSafe,
		reactions: normalizedExisting.reactions,
		user_reactions: normalizedExisting.user_reactions,
		previews: mergedPreviews,
		attachments: mergedAttachments
	};
	// Preserve a local edit over a stale REST snapshot.
	const existingEditIsNewer =
		normalizedExisting.edited_at !== null &&
		(incomingSafe.edited_at === null ||
			Date.parse(normalizedExisting.edited_at) > Date.parse(incomingSafe.edited_at));

	if (existingEditIsNewer) {
		merged.content = normalizedExisting.content;
		merged.edited_at = normalizedExisting.edited_at;
	}
	return merged;
}

// Add or overwrite a message (dedupe by id) and re-sort. When the message
// already exists, merge (preserve WS deltas) instead of blind-overwriting.
export function upsertMessage(
	state: MessagesState,
	channelId: string,
	msg: MessageWithAttachment
): void {
	const safeMessage = coerceMessage(msg);
	const ch = state.channels.get(channelId);
	let inserted = false;
	if (ch) {
		const merged = mergeFetchedMessage(ch.byId.get(safeMessage.id), safeMessage, ch);
		if (merged) {
			const newByd = new SvelteMap<string, MessageWithAttachment>();
			for (const [id, m] of ch.byId) {
				newByd.set(id, m);
			}
			newByd.set(safeMessage.id, merged);

			const trimmed =
				ch.windowMode === 'latest'
					? trimLatestWindow(ch, newByd)
					: {
							byId: newByd,
							hasMoreOlder: ch.hasMoreOlder,
							cursorOlder: ch.cursorOlder
						};

			state.channels.set(channelId, {
				...ch,
				byId: trimmed.byId,
				ids: sortedIds(trimmed.byId),
				hasMoreOlder: trimmed.hasMoreOlder,
				cursorOlder: trimmed.cursorOlder
			});
			inserted = true;
		}
	} else {
		// No channel state yet: create it and insert.
		const c = newChannelState();
		c.byId.set(safeMessage.id, safeMessage);
		c.ids = [safeMessage.id];
		c.loaded = true;
		state.channels.set(channelId, c);
		inserted = true;
	}
	// Apply any preview that resolved before the message arrived (P0.5).
	if (inserted) {
		applyPendingPreview(state, safeMessage.id);
	}
}

// Patch a message's fields (replaces it in byId with a new object).
function patchMessage(
	state: MessagesState,
	channelId: string,
	messageId: string,
	patch: Partial<MessageWithAttachment>
): void {
	replaceChannel(state, channelId, (old) => {
		const msg = old.byId.get(messageId);
		if (!msg) {
			return old;
		}
		const newByd = new SvelteMap<string, MessageWithAttachment>();
		for (const [id, m] of old.byId) {
			newByd.set(id, m);
		}
		newByd.set(messageId, { ...msg, ...patch });
		return {
			...old,
			byId: newByd,
			ids: sortedIds(newByd)
		};
	});
}

// Remove a message from byId, ids and the pinned list, and tombstone it so
// a delayed REST snapshot cannot resurrect it.
export function removeMessage(state: MessagesState, channelId: string, messageId: string): void {
	let ch = state.channels.get(channelId);

	if (!ch) {
		ch = newChannelState();
		state.channels.set(channelId, ch);
	}

	const newById = new SvelteMap<string, MessageWithAttachment>();

	for (const [id, message] of ch.byId) {
		if (id !== messageId) {
			newById.set(id, message);
		}
	}

	state.channels.set(channelId, {
		...ch,
		byId: newById,
		ids: sortedIds(newById),
		pinned: ch.pinned.filter((p) => p.id !== messageId),
		deletedMessageIds: new SvelteSet([...ch.deletedMessageIds, messageId])
	});
}

// Pin/unpin a message in the pinned list (source of truth for pinned status).
export function patchPinned(state: MessagesState, messageId: string, isPinned: boolean): void {
	for (const [channelId, ch] of state.channels) {
		const msg = ch.byId.get(messageId);
		const alreadyPinned = ch.pinned.some((p) => p.id === messageId);

		if (!msg && !alreadyPinned) {
			continue;
		}

		replaceChannel(state, channelId, (old) => {
			const currentMsg = old.byId.get(messageId);

			let pinned = [...old.pinned];

			if (isPinned) {
				if (currentMsg && !pinned.some((p) => p.id === messageId)) {
					pinned = [...pinned, currentMsg];
				}
			} else {
				pinned = pinned.filter((p) => p.id !== messageId);
			}

			return {
				...old,
				pinned
			};
		});

		return;
	}
}

const previewRequests = new SvelteMap<string, Promise<LinkPreviewWithImage>>();

export function ensurePreview(previewId: string): Promise<LinkPreviewWithImage> {
	const cached = previewCache.get(previewId);

	if (cached) {
		return Promise.resolve(cached);
	}

	const existing = previewRequests.get(previewId);

	if (existing) {
		return existing;
	}

	const epoch = storeEpoch;

	const request = api.linkPreviews
		.get(previewId)
		.then((preview) => {
			if (epoch !== storeEpoch) {
				throw new Error('stale preview request');
			}

			previewCache.set(preview.id, preview);

			return preview;
		})
		.finally(() => {
			// Uma request velha não pode apagar uma nova
			// request do mesmo preview id.
			if (previewRequests.get(previewId) === request) {
				previewRequests.delete(previewId);
			}
		});

	previewRequests.set(previewId, request);

	return request;
}

// React update: upsert the reaction group by (emoji_id, unicode). count 0
// removes the group. user_reactions are untouched.
export function reactUpdate(state: MessagesState, event: WsReactUpdate): void {
	touchDuringAnyFresh(event.message_id);
	for (const [channelId, ch] of state.channels) {
		const msg = ch.byId.get(event.message_id);

		if (!msg) {
			continue;
		}
		const key = (v: string | null) => v ?? '';
		const idx = msg.reactions.findIndex(
			(r) => key(r.emoji_id) === key(event.emoji_id) && key(r.unicode) === key(event.unicode)
		);
		let reactions: { emoji_id: string | null; unicode: string | null; count: number }[];
		if (event.count === 0) {
			// Remove the group (no-op if it doesn't exist yet).
			reactions = msg.reactions.filter((_, i) => i !== idx);
		} else if (idx === -1) {
			// Insert a new group (upsert).
			reactions = [
				...msg.reactions,
				{ emoji_id: event.emoji_id, unicode: event.unicode, count: event.count }
			];
		} else {
			reactions = msg.reactions.map((r, i) => {
				if (
					i === idx &&
					key(r.emoji_id) === key(event.emoji_id) &&
					key(r.unicode) === key(event.unicode)
				) {
					return { ...r, count: event.count };
				}
				return r;
			});
		}
		const changed =
			msg.reactions.length !== reactions.length ||
			msg.reactions.some(
				(r, i) =>
					key(r.emoji_id) !== key(reactions[i]?.emoji_id) ||
					key(r.unicode) !== key(reactions[i]?.unicode) ||
					r.count !== reactions[i]?.count
			);
		if (!changed) {
			continue;
		}
		replaceChannel(state, channelId, (old) => {
			const m = old.byId.get(event.message_id);
			if (!m) {
				return old;
			}
			const newByd = new SvelteMap<string, MessageWithAttachment>();
			for (const [id, mm] of old.byId) {
				newByd.set(id, mm);
			}
			newByd.set(event.message_id, { ...m, reactions });
			return {
				...old,
				byId: newByd,
				ids: sortedIds(newByd)
			};
		});
		break;
	}
}

// Remove a preview from a message's previews and tombstone it, so a delayed
// REST snapshot / in-flight GET cannot resurrect it.
export function removePreview(state: MessagesState, messageId: string, previewId: string): void {
	const key = previewKey(messageId, previewId);

	previewTombstones.add(key);
	previewCache.delete(previewId);
	deletePendingPreview(messageId, previewId);
	for (const [channelId, ch] of state.channels) {
		const msg = ch.byId.get(messageId);

		if (!msg) {
			continue;
		}

		touchDuringFresh(channelId, messageId);
		const nextPreviews = msg.previews.filter((p) => p.id !== previewId);
		if (nextPreviews.length === msg.previews.length) {
			// Not present in the message, but tombstone anyway (a delayed
			// REST page / in-flight GET must still be blocked).
			replaceChannel(state, channelId, (old) => {
				const m = old.byId.get(messageId);
				if (!m) {
					return old;
				}
				return {
					...old,
					previewTombstones: new SvelteSet([...old.previewTombstones, `${messageId}:${previewId}`])
				};
			});
			continue;
		}
		replaceChannel(state, channelId, (old) => {
			const m = old.byId.get(messageId);
			if (!m) {
				return old;
			}
			const newByd = new SvelteMap<string, MessageWithAttachment>();
			for (const [id, mm] of old.byId) {
				newByd.set(id, mm);
			}
			newByd.set(messageId, { ...m, previews: nextPreviews });
			return {
				...old,
				byId: newByd,
				ids: sortedIds(newByd),
				previewTombstones: new SvelteSet([...old.previewTombstones, `${messageId}:${previewId}`])
			};
		});
		break;
	}
}

// Link preview update: upsert (replace by id, or insert if absent) and drop
// any tombstone for this preview (this WS event is, by reception order, a
// later creation/update that must win over an earlier remove).
export function linkPreviewUpdate(state: MessagesState, event: WsLinkPreviewUpdate): void {
	const { channel_id, message_id, preview } = event;
	const key = previewKey(message_id, preview.id);

	// este update é posterior ao remove, então ganha pela ordem WS
	previewTombstones.delete(key);
	previewCache.set(preview.id, preview);

	const ch = state.channels.get(channel_id);

	if (ch?.previewTombstones.has(key)) {
		const tombstones = new SvelteSet(ch.previewTombstones);

		tombstones.delete(key);

		state.channels.set(channel_id, {
			...ch,
			previewTombstones: tombstones
		});
	}

	const current = state.channels.get(channel_id);
	const msg = current?.byId.get(message_id);

	if (!current || !msg) {
		setPendingPreview(message_id, preview);
		return;
	}

	mergePreview(state, message_id, preview);
}

// Merge a resolved preview into the message it belongs to (P0.5). The message
// keeps only the metadata (no image_data); the full preview (with image_data)
// is stored in previewCache for rendering. Returns true if the preview was
// applied (or was already present, i.e. idempotent); false if the message is
// absent from the cache or the preview is tombstoned (never resurrect).
export function mergePreview(
	state: MessagesState,
	messageId: string,
	preview: LinkPreviewWithImage
): boolean {
	for (const [channelId, ch] of state.channels) {
		const msg = ch.byId.get(messageId);

		if (!msg) {
			continue;
		}

		touchDuringFresh(channelId, messageId);
		if (previewTombstones.has(previewKey(messageId, preview.id))) {
			return false;
		}
		if (ch.previewTombstones.has(`${messageId}:${preview.id}`)) {
			// Tombstoned: never resurrect.
			return false;
		}
		const p: LinkPreview = {
			id: preview.id,
			url: preview.url,
			kind: preview.kind,
			title: preview.title,
			description: preview.description,
			provider_name: preview.provider_name,
			embed_url: preview.embed_url,
			image_mime_type: preview.image_mime_type,
			image_size_bytes: preview.image_size_bytes,
			fetched_at: preview.fetched_at
		};

		const exists = msg.previews.some((existing) => existing.id === preview.id);

		const nextPreviews = exists
			? msg.previews.map((existing) => (existing.id === preview.id ? p : existing))
			: [...msg.previews, p];

		previewCache.set(preview.id, preview);

		replaceChannel(state, channelId, (old) => {
			const m = old.byId.get(messageId);
			if (!m) return old;

			const newById = new SvelteMap<string, MessageWithAttachment>();

			for (const [id, mm] of old.byId) {
				newById.set(id, mm);
			}

			newById.set(messageId, {
				...m,
				previews: nextPreviews
			});

			return {
				...old,
				byId: newById,
				ids: sortedIds(newById)
			};
		});

		return true;
	}
	return false;
}

// Apply any pending preview for a message (called after the message arrives,
// so a preview resolved before the message can still be attached).
function applyPendingPreview(state: MessagesState, messageId: string): void {
	const previews = pendingPreviews.get(messageId);
	if (!previews) return;

	for (const [previewId, preview] of previews) {
		if (previewTombstones.has(previewKey(messageId, previewId))) {
			previews.delete(previewId);
			continue;
		}

		if (mergePreview(state, messageId, preview)) {
			previews.delete(previewId);
		}
	}

	if (previews.size === 0) {
		pendingPreviews.delete(messageId);
	}
}

// new_preview is async (needs GET /link-previews/:preview_id). The store
// fetches and applies it: if the message is already cached, immediately;
// otherwise it stays pending until the message arrives.
export function handleNewPreview(event: WsNewPreview): void {
	const { message_id, preview_id } = event;
	const key = previewKey(message_id, preview_id);

	if (previewTombstones.has(key)) {
		return;
	}

	const epoch = storeEpoch;

	void ensurePreview(preview_id)
		.then((preview) => {
			if (epoch !== storeEpoch || previewTombstones.has(key)) {
				return;
			}

			if (!mergePreview(state, message_id, preview)) {
				setPendingPreview(message_id, preview);
			}
		})
		.catch(() => {});
}

function touchDuringAnyFresh(messageId: string): void {
	for (const guard of freshGuards.values()) {
		guard.touched.add(messageId);
	}
}

// Attachment moderation update: patch the attachment's moderation_status.
export function attachmentModerationUpdate(
	state: MessagesState,
	event: WsAttachmentModerationUpdate
): void {
	const { channel_id, message_id, attachment_id, status } = event;
	touchDuringFresh(channel_id, message_id);
	const ch = state.channels.get(channel_id);
	if (!ch) {
		return;
	}
	const msg = ch.byId.get(message_id);

	if (!msg) {
		return;
	}
	const nextAttachments = msg.attachments.map((a) =>
		a.id === attachment_id ? { ...a, moderation_status: status } : a
	);
	replaceChannel(state, channel_id, (old) => {
		const m = old.byId.get(message_id);
		if (!m) {
			return old;
		}
		const newByd = new SvelteMap<string, MessageWithAttachment>();
		for (const [id, mm] of old.byId) {
			newByd.set(id, mm);
		}
		newByd.set(message_id, { ...m, attachments: nextAttachments });
		return {
			...old,
			byId: newByd,
			ids: sortedIds(newByd)
		};
	});
}

// The pure WS reducer — single entry point for all message-related outbound
// events.
export function applyEvent(state: MessagesState, event: WsOutbound): void {
	switch (event.type) {
		case 'message': {
			touchDuringFresh(event.channel_id, event.id);
			// In a historical window, new WS messages are outside the window:
			// don't insert (would force scroll / bloat); just count them.
			const ch = state.channels.get(event.channel_id);
			if (ch && ch.windowMode === 'historical' && !ch.byId.has(event.id)) {
				state.channels.set(event.channel_id, {
					...ch,
					hasMoreNewer: true
				});
			} else {
				upsertMessage(state, event.channel_id, wsMessageToMsg(event));
			}
			break;
		}
		case 'message_edit':
			touchDuringFresh(event.channel_id, event.id);
			patchMessage(state, event.channel_id, event.id, {
				content: event.content,
				edited_at: event.edited_at
			});
			break;
		case 'message_delete':
			touchDuringFresh(event.channel_id, event.id);
			removeMessage(state, event.channel_id, event.id);
			break;
		case 'message_pin':
			patchPinned(state, event.message_id, event.is_pinned);
			break;
		case 'react_update':
			reactUpdate(state, event);
			break;
		case 'remove_preview':
			removePreview(state, event.message_id, event.preview_id);
			break;
		case 'link_preview_update':
			linkPreviewUpdate(state, event);
			break;
		case 'attachment_moderation_update':
			attachmentModerationUpdate(state, event);
			break;
		default:
			break;
	}
}

// ── store actions ─────────────────────────────────────────

export function evict(channelId: string): void {
	// Clear per-channel caches (tombstones, pending previews) before drop.
	state.channels.delete(channelId);
}

type FreshGuard = {
	gen: number;
	touched: Set<string>;
};

const freshGuards = new SvelteMap<string, FreshGuard>();

function touchDuringFresh(channelId: string, messageId: string): void {
	freshGuards.get(channelId)?.touched.add(messageId);
}

async function _fetchPage(
	channelId: string,
	q?: { since?: string; last_id?: string }
): Promise<void> {
	if (!state.channels.has(channelId)) {
		state.channels.set(channelId, newChannelState());
	}
	const ch = state.channels.get(channelId) ?? newChannelState();
	if (ch.loading && q != null) {
		return;
	}
	const gen = ++requestSerial;
	const freshLatest = q == null;

	if (freshLatest) {
		freshGuards.set(channelId, {
			gen,
			touched: new Set()
		});
	}

	state.channels.set(channelId, {
		...ch,
		requestGeneration: gen,
		loading: true
	});
	try {
		const res = await api.messages.list(channelId, q);
		// Normaliza arrays nulos vindos da API (previews/reactions).
		const messages = res.messages.map(coerceMessage);
		const current = state.channels.get(channelId);
		if (!current || current.requestGeneration !== gen) {
			return;
		}
		const ch2 = state.channels.get(channelId);
		// Discard if the channel was evicted/refreshed while in flight (P0.4).
		if (!ch2 || ch2.requestGeneration !== gen) {
			return;
		}

		// Imagens de preview (image_data) não vêm no REST (só metadados); o
		// previewCache fica vazio em carga inicial (F5). Resolve via
		// GET /link-previews/:id para renderizar. ensurePreview é idempotente
		// (cache + dedup in-flight), então é seguro chamar por preview id.
		const previewIds = new Set<string>();
		for (const m of messages) {
			for (const p of m.previews) {
				previewIds.add(p.id);
			}
		}
		for (const id of previewIds) {
			ensurePreview(id);
		}

		const newByd = new SvelteMap<string, MessageWithAttachment>();

		if (!freshLatest) {
			for (const [id, m] of ch2.byId) {
				const merged = mergeFetchedMessage(m, m, ch2);

				if (merged) {
					newByd.set(id, merged);
				}
			}
		}
		for (const m of messages) {
			const existing = freshLatest ? undefined : ch2.byId.get(m.id);

			const merged = mergeFetchedMessage(existing, m, ch2);

			if (merged) {
				newByd.set(m.id, merged);
			}
		}
		let needsFreshRetry = false;

		if (freshLatest) {
			const guard = freshGuards.get(channelId);

			if (guard?.gen === gen) {
				for (const messageId of guard.touched) {
					if (ch2.deletedMessageIds.has(messageId)) {
						newByd.delete(messageId);
						continue;
					}

					const currentMessage = ch2.byId.get(messageId);

					const restMessage = newByd.get(messageId);

					if (!currentMessage) {
						// O WS alterou uma mensagem que não existia
						// na janela anterior. Não temos uma versão local
						// completa para fazer merge.
						if (restMessage) {
							needsFreshRetry = true;
						}

						continue;
					}

					if (!restMessage) {
						newByd.set(messageId, currentMessage);

						continue;
					}

					const merged = mergeFetchedMessage(currentMessage, restMessage, ch2);

					if (merged) {
						newByd.set(messageId, merged);
					}
				}
			}
		}
		// Trim to MAX_WINDOW.
		const dropCount = newByd.size - MAX_WINDOW;
		let drop: string[] = [];
		let trimmedNewer = false;

		if (dropCount > 0) {
			const ids = sortedIds(newByd);

			if (ch2.windowMode === 'latest') {
				drop = ids.slice(0, dropCount);
			} else {
				drop = ids.slice(ids.length - dropCount);
				trimmedNewer = true;
			}

			const dropped: MessageWithAttachment[] = [];
			for (const id of drop) {
				const m = newByd.get(id);
				if (m) dropped.push(m);
				newByd.delete(id);
			}
			releaseMessageResources(newByd, dropped);
		}
		state.channels.set(channelId, {
			...ch2,
			byId: newByd,
			hasMoreNewer: q == null ? false : ch2.hasMoreNewer || trimmedNewer,
			ids: sortedIds(newByd),
			loaded: true,
			hasMoreOlder: res.has_more,
			cursorOlder: nextCursor(res.messages) ?? null
			// A fresh load (q == null) is anchored at the newest message.
		});
		for (const message of messages) {
			if (newByd.has(message.id)) {
				applyPendingPreview(state, message.id);
			}
		}
		if (needsFreshRetry) {
			load(channelId);
		}
	} finally {
		const guard = freshGuards.get(channelId);

		if (guard?.gen === gen) {
			freshGuards.delete(channelId);
		}
		const current = state.channels.get(channelId);

		if (current && current.requestGeneration === gen) {
			state.channels.set(channelId, {
				...current,
				loading: false
			});
		}
	}
}

export function getPreview(previewId: string): LinkPreviewWithImage | null {
	return previewCache.get(previewId) ?? null;
}

// In-flight explicit fresh loads, keyed by channel (dedupes concurrent
// refreshes). Awaits the fetch so callers (jump-to-latest / gotoMessage) can
// scroll after the latest page is in the window.
const _freshInflight = new SvelteMap<string, Promise<void>>();

// Fresh load: latest 100, anchored at the newest message. Awaits the fetch.
// Always fetches (no short-circuit) so callers can rely on a real reload.
async function _freshLoad(channelId: string): Promise<void> {
	if (!state.channels.has(channelId)) {
		state.channels.set(channelId, newChannelState());
	}
	const ch = state.channels.get(channelId)!;
	// Reset window for a fresh load.
	state.channels.set(channelId, {
		...ch,
		windowMode: 'latest',
		hasMoreNewer: false
	});
	await _fetchPage(channelId);
}

// Tracked explicit fresh load (deduped across concurrent callers).
function _freshLoadTracked(channelId: string): Promise<void> {
	const existing = _freshInflight.get(channelId);
	if (existing) {
		return existing;
	}
	const p = _freshLoad(channelId).finally(() => {
		if (_freshInflight.get(channelId) === p) {
			_freshInflight.delete(channelId);
		}
	});
	_freshInflight.set(channelId, p);
	return p;
}

// Fresh load: latest 100, anchored at the newest message (always fetches).
export function load(channelId: string): void {
	_freshLoadTracked(channelId).catch(() => {});
}

// Idempotent initial load: used by the page effect. Skips when the channel
// already has a page in flight or already loaded, so an effect re-run cannot
// re-trigger a fresh fetch. `load()`/`setLatest()` stay for explicit refreshes.
export function ensureLoaded(channelId: string): Promise<void> {
	const ch = state.channels.get(channelId);
	if (ch && ch.loaded && !ch.loading) {
		return Promise.resolve();
	}
	return _freshLoadTracked(channelId).catch(() => {});
}

// Navigate to older messages: fetch the next page towards older. Resolves when
// the page is in the window (so callers can scroll-compensate the prepend).
export function loadMoreOlder(channelId: string): Promise<void> {
	const ch = state.channels.get(channelId);
	// Guard: no in-flight page + a cursor to continue from (P1.11).
	if (!ch || ch.loading || !ch.cursorOlder) {
		return Promise.resolve();
	}
	// Navigating up → historical window.
	state.channels.set(channelId, { ...ch, windowMode: 'historical' });
	return _fetchPage(channelId, {
		since: ch.cursorOlder.since,
		last_id: ch.cursorOlder.last_id
	}).catch(() => {});
}

// Navigate back to the newest message: reconcile via REST (fresh latest page).
// Resolves once the latest page is in the window (so callers can scroll after).
export function setLatest(channelId: string): Promise<void> {
	return _freshLoadTracked(channelId).catch(() => {});
}

// Navigate to a specific message: load pages until it is in the window.
// Returns true when the message ends up in `byId` (the caller scrolls to it).
// `createdAt` (the target's created_at, or a close approximation) picks the
// direction: if the target is newer than the window's newest message, jump to
// the newest first, then page towards older from the top. Otherwise page
// towards older from `cursorOlder`.
export async function gotoMessage(
	channelId: string,
	messageId: string,
	createdAt: string | null
): Promise<boolean> {
	await ensureLoaded(channelId);

	const ch = state.channels.get(channelId);
	if (!ch) {
		return false;
	}
	if (ch.byId.has(messageId)) {
		return true;
	}

	// Direction: is the target newer than the window's newest message?
	const ids = ch.ids;
	const newest =
		ids.length > 0 ? ch.byId.get(ids[ids.length - 1]) ?? null : null;

	const targetIsNewer =
		newest !== null &&
		((createdAt && createdAt > newest.created_at) ||
			(createdAt === newest.created_at && messageId > newest.id));

	if (targetIsNewer) {
		// Jump to the newest, then page towards older from the top.
		await _freshLoadTracked(channelId);
		const ch2 = state.channels.get(channelId);
		if (ch2 && ch2.byId.has(messageId)) {
			return true;
		}
	}

	// Page towards older until the message appears or the history is exhausted.
	while (true) {
		const c = state.channels.get(channelId);
		if (!c || !c.hasMoreOlder || !c.cursorOlder) {
			return false;
		}
		const cursor = c.cursorOlder;
		// Navigating up → historical window.
		state.channels.set(channelId, { ...c, windowMode: 'historical' });
		try {
			await _fetchPage(channelId, {
				since: cursor.since,
				last_id: cursor.last_id
			});
		} catch {
			return false;
		}
		const c2 = state.channels.get(channelId);
		if (c2 && c2.byId.has(messageId)) {
			return true;
		}
	}
}

export function send(payload: {
	channel_id: string;
	content: string | null;
	reply_to: string | null;
	files?: File[];
	onProgress?: (percent: number) => void;
}): Promise<MessageWithAttachment> {
	const { onProgress, ...msgPayload } = payload;
	return api.messages.send(msgPayload, onProgress).then((message) => {
		upsertMessage(state, message.channel_id, message);
		return message;
	});
}

export function edit(messageId: string, content: string): Promise<MessageWithAttachment> {
	return api.messages.edit(messageId, { content }).then((message) => {
		upsertMessage(state, message.channel_id, message);
		return message;
	});
}

export async function remove(messageId: string): Promise<void> {
	let channelId: string | null = null;
	for (const [id, channel] of state.channels) {
		if (channel.byId.has(messageId)) {
			channelId = id;
			break;
		}
	}

	await api.messages.remove(messageId);
	if (channelId) {
		removeMessage(state, channelId, messageId);
	}
}

export function pin(
	channelId: string,
	messageId: string
): Promise<{
	channel_id: string;
	message_id: string;
	pinned_by: string | null;
	pinned_at: string;
}> {
	return api.messages.pin(channelId, messageId).then((result) => {
		patchPinned(state, messageId, true);
		return result;
	});
}

export function unpin(channelId: string, messageId: string): Promise<void> {
	return api.messages.unpin(channelId, messageId).then(() => {
		patchPinned(state, messageId, false);
	});
}
// DROP-IN: substitua updateUserReactions(), react() e unreact() por este bloco.
//
// Objetivo:
// - atualizar `reactions` e `user_reactions` juntos;
// - atualizar a UI imediatamente, sem depender do WS para a contagem;
// - manter o WS como fonte de reconciliação do count absoluto;
// - sempre ler a mensagem atual no momento da mutação;
// - fazer rollback se a request falhar.

type ReactionInput = {
	emoji_id: string | null;
	unicode: string | null;
};

type ApiUserReaction = ReactionInput & {
	id?: string;
};

function reactionKey(r: ReactionInput): string {
	return `${r.emoji_id ?? ''}:${r.unicode ?? ''}`;
}

function updateMessageAtomic(
	channelId: string,
	messageId: string,
	updater: (current: MessageWithAttachment) => MessageWithAttachment
): void {
	touchDuringFresh(channelId, messageId);

	const ch = state.channels.get(channelId);
	const current = ch?.byId.get(messageId);

	if (!ch || !current) return;

	const nextMessage = updater(current);

	// Só cria novas referências depois de aplicar o updater sobre o estado MAIS RECENTE.
	const nextById = new SvelteMap<string, MessageWithAttachment>();
	for (const [id, message] of ch.byId) {
		nextById.set(id, message);
	}
	nextById.set(messageId, nextMessage);

	state.channels.set(channelId, {
		...ch,
		byId: nextById,
		ids: sortedIds(nextById)
	});
}

function applyLocalReaction(
	channelId: string,
	messageId: string,
	reaction: ApiUserReaction,
	remove: boolean
): void {
	const wantedKey = reactionKey(reaction);

	updateMessageAtomic(channelId, messageId, (msg) => {
		const mineBefore = msg.user_reactions.some(
			(r) => reactionKey(r) === wantedKey
		);

		// Idempotência: não incrementa/decrementa duas vezes a mesma reação local.
		if (!remove && mineBefore) return msg;
		if (remove && !mineBefore) return msg;

		const nextUserReactions = remove
			? msg.user_reactions.filter((r) => reactionKey(r) !== wantedKey)
			: [
					...msg.user_reactions.filter((r) => reactionKey(r) !== wantedKey),
					{
						id: reaction.id ?? '',
						emoji_id: reaction.emoji_id,
						unicode: reaction.unicode
					}
				];

		const existingIndex = msg.reactions.findIndex(
			(r) => reactionKey(r) === wantedKey
		);

		let nextReactions: typeof msg.reactions;

		if (remove) {
			if (existingIndex === -1) {
				nextReactions = msg.reactions;
			} else {
				const existing = msg.reactions[existingIndex];
				const nextCount = Math.max(0, existing.count - 1);

				if (nextCount === 0) {
					nextReactions = msg.reactions.filter((_, i) => i !== existingIndex);
				} else {
					nextReactions = msg.reactions.map((r, i) =>
						i === existingIndex ? { ...r, count: nextCount } : r
					);
				}
			}
		} else {
			if (existingIndex === -1) {
				nextReactions = [
					...msg.reactions,
					{
						emoji_id: reaction.emoji_id,
						unicode: reaction.unicode,
						count: 1
					}
				];
			} else {
				nextReactions = msg.reactions.map((r, i) =>
					i === existingIndex ? { ...r, count: r.count + 1 } : r
				);
			}
		}

		return {
			...msg,
			reactions: nextReactions,
			user_reactions: nextUserReactions
		};
	});
}

export function react(
	channelId: string,
	messageId: string,
	req: ReactionInput
): Promise<{
	message_id: string;
	user_id: string;
	emoji_id: string | null;
	unicode: string | null;
	created_at: string;
}> {
	const epoch = storeEpoch;

	// Otimista e síncrono: o pill/count muda antes de qualquer evento WS poder chegar.
	applyLocalReaction(channelId, messageId, req, false);

	return api.messages.react(channelId, messageId, req).then(
		(r) => {
			// Não reescreve a mensagem aqui.
			// O estado otimista já foi aplicado e o WS pode reconciliar o count absoluto.
			return r;
		},
		(error) => {
			// Request falhou: desfaz somente a alteração otimista.
			if (epoch === storeEpoch) {
				applyLocalReaction(channelId, messageId, req, true);
			}
			throw error;
		}
	);
}

export function unreact(
	channelId: string,
	messageId: string,
	req: ReactionInput
): Promise<void> {
	const epoch = storeEpoch;

	// Otimista e síncrono.
	applyLocalReaction(channelId, messageId, req, true);

	return api.messages.unreact(channelId, messageId, req).then(
		() => undefined,
		(error) => {
			// Request falhou: recoloca a reação.
			if (epoch === storeEpoch) {
				applyLocalReaction(channelId, messageId, req, false);
			}
			throw error;
		}
	);
}

export function reactionUsers(
	channelId: string,
	messageId: string,
	q?: { since?: string; last_id?: string }
): Promise<{
	message_id: string;
	reactions: {
		emoji_id: string | null;
		unicode: string | null;
		count: number;
		users: { id: string; user_id: string; created_at: string }[];
	}[];
	has_more: boolean;
}> {
	return api.messages.reactionUsers(channelId, messageId, q);
}


export function loadPinned(channelId: string): void {
	const ch = state.channels.get(channelId);

	if (!ch || ch.pinnedLoading) {
		return;
	}

	const gen = ++requestSerial;

	state.channels.set(channelId, {
		...ch,
		pinnedLoading: true,
		pinnedGeneration: gen
	});

	void api.channels
		.pinned(channelId)
		.then((res) => {
			const current = state.channels.get(channelId);

			if (!current || current.pinnedGeneration !== gen) {
				return;
			}

			state.channels.set(channelId, {
				...current,
				pinned: res.pinned
					.map(coerceMessage)
					.filter((message) => !current.deletedMessageIds.has(message.id)),
				pinnedLoaded: true
			});
		})
		.catch(() => {})
		.finally(() => {
			const current = state.channels.get(channelId);

			if (current && current.pinnedGeneration === gen) {
				state.channels.set(channelId, {
					...current,
					pinnedLoading: false
				});
			}
		});
}

export function getChannel(channelId: string): ChannelMessagesState | null {
	return state.channels.get(channelId) ?? null;
}

export function getMessage(channelId: string, messageId: string): MessageWithAttachment | null {
	const ch = state.channels.get(channelId);
	if (!ch) {
		return null;
	}
	return ch.byId.get(messageId) ?? null;
}

// Applied after a successful send/edit so the cache matches the server's
// response.
export function applySendResponse(channelId: string, msg: MessageWithAttachment): void {
	const m = coerceMessage(msg);
	const ch = state.channels.get(channelId);

	if (ch?.windowMode === 'historical') {
		setLatest(channelId);
		return;
	}

	upsertMessage(state, channelId, m);
}

// Full reset (logout / 401 / account switch) — clears every channel cache and
// the module-level preview/pending maps.
export function reset(): void {
	storeEpoch += 1;

	previewRequests.clear();
	freshGuards.clear();
	state.channels.clear();
	pendingPreviews.clear();
	previewCache.clear();
	previewTombstones.clear();
}

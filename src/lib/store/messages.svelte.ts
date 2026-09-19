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

import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api';
import { nextCursor } from '../utils/keyset';
import type {
	ChannelMessagesState,
	MessagesState,
} from './messages.types';
import type {
	LinkPreview,
	LinkPreviewWithImage,
	MessageWithAttachment,
	WsAttachmentModerationUpdate,
	WsLinkPreviewUpdate,
	WsMessage,
	WsMessageDelete,
	WsMessageEdit,
	WsMessagePin,
	WsNewPreview,
	WsOutbound,
	WsReactUpdate,
	WsRemovePreview,
} from '../types';

// ── window policy (P1.12) ───────────────────────────────
// Max messages kept per channel.
const MAX_WINDOW = 300;

// ── caches (module-level, non-reactive) ─────────────────
// Resolved previews (with image_data) keyed by preview_id. The message only
// keeps the preview metadata; image_data lives here for rendering.
const previewCache = new Map<string, LinkPreviewWithImage>();
// new_preview events whose message is not yet in the cache. Keyed by
// message_id (new_preview carries no channel_id). Applied when the message
// arrives in a channel, subject to the tombstone check.
const pendingPreviews = new Map<string, LinkPreviewWithImage>();

// ── state ─────────────────────────────────────────────────

export const state = $state<MessagesState>({
	channels: new SvelteMap<string, ChannelMessagesState>(),
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
	};
}

// ── ordering helpers (pure) ───────────────────────────────

export function compareMessages(
	a: MessageWithAttachment,
	b: MessageWithAttachment
): number {
	if (a.created_at !== b.created_at) {
		return a.created_at < b.created_at ? -1 : 1;
	}
	if (a.id !== b.id) {
		return a.id < b.id ? -1 : 1;
	}
	return 0;
}

export function sortedIds(
	byId: SvelteMap<string, MessageWithAttachment>
): string[] {
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
		user_reactions: [],
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

// Merge a REST `incoming` message into an existing local `existing` message,
// preserving WS deltas (reactions, user_reactions, previews, edits) that a
// stale REST snapshot must not clobber. Returns null when the message is
// tombstoned (deleted via WS) → never resurrect it.
export function mergeFetchedMessage(
	existing: MessageWithAttachment | undefined,
	incoming: MessageWithAttachment,
	ch: ChannelMessagesState
): MessageWithAttachment | null {
	if (ch.deletedMessageIds.has(incoming.id)) {
		return null;
	}
	if (!existing) {
		// Not in the local cache: insert the REST message as-is.
		return incoming;
	}
	// Exists locally: never blind-overwrite. Preserve WS deltas.
	const previewKey = (pid: string) => `${existing.id}:${pid}`;
	const keptPreviews = existing.previews.filter(
		(p) => !ch.previewTombstones.has(previewKey(p.id))
	);
	const keptPreviewIds = new Set(keptPreviews.map((p) => p.id));
	const mergedPreviews: LinkPreview[] = [
		...keptPreviews,
		...incoming.previews.filter((p) => !keptPreviewIds.has(p.id)),
	];
	// Attachments: preserve a local (WS-moderation) status over a stale REST.
	const mergedAttachments = incoming.attachments.map((a) => {
		const local = existing.attachments.find((la) => la.id === a.id);
		if (local && local.moderation_status !== a.moderation_status) {
			return { ...a, moderation_status: local.moderation_status };
		}
		return a;
	});
	const merged: MessageWithAttachment = {
		...incoming,
		reactions: existing.reactions,
		user_reactions: existing.user_reactions,
		previews: mergedPreviews,
		attachments: mergedAttachments,
	};
	// Preserve a local edit over a stale REST snapshot.
	if (existing.edited_at && !incoming.edited_at) {
		merged.content = existing.content;
		merged.edited_at = existing.edited_at;
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
	const ch = state.channels.get(channelId);
	let inserted = false;
	if (ch) {
		const merged = mergeFetchedMessage(ch.byId.get(msg.id), msg, ch);
		if (merged) {
			const newByd = new SvelteMap<string, MessageWithAttachment>();
			for (const [id, m] of ch.byId) {
				newByd.set(id, m);
			}
			newByd.set(msg.id, merged);
			state.channels.set(channelId, {
				...ch,
				byId: newByd,
				ids: sortedIds(newByd),
			});
			inserted = true;
		}
	} else {
		// No channel state yet: create it and insert.
		const c = newChannelState();
		c.byId.set(msg.id, msg);
		c.ids = [msg.id];
		c.loaded = true;
		state.channels.set(channelId, c);
		inserted = true;
	}
	// Apply any preview that resolved before the message arrived (P0.5).
	if (inserted) {
		applyPendingPreview(state, msg.id);
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
			ids: sortedIds(newByd),
		};
	});
}

// Remove a message from byId, ids and the pinned list, and tombstone it so
// a delayed REST snapshot cannot resurrect it.
export function removeMessage(
	state: MessagesState,
	channelId: string,
	messageId: string
): void {
	replaceChannel(state, channelId, (old) => {
		const newByd = new SvelteMap<string, MessageWithAttachment>();
		let removed = false;
		for (const [id, m] of old.byId) {
			if (id === messageId) {
				removed = true;
			} else {
				newByd.set(id, m);
			}
		}
		if (!removed) {
			return old;
		}
		return {
			...old,
			byId: newByd,
			ids: sortedIds(newByd),
			pinned: old.pinned.filter((p) => p.id !== messageId),
			deletedMessageIds: new Set([...old.deletedMessageIds, messageId]),
		};
	});
}

// Pin/unpin a message in the pinned list (source of truth for pinned status).
export function patchPinned(
	state: MessagesState,
	messageId: string,
	isPinned: boolean
): void {
	for (const [channelId, ch] of state.channels) {
		if (!ch.byId.has(messageId)) {
			continue;
		}
		replaceChannel(state, channelId, (old) => {
			const msg = old.byId.get(messageId);
			if (!msg) {
				return old;
			}
			let pinned = [...old.pinned];
			if (isPinned) {
				if (!pinned.some((p) => p.id === messageId)) {
					pinned = [...pinned, msg];
				}
			} else {
				pinned = pinned.filter((p) => p.id !== messageId);
			}
			return { ...old, pinned };
		});
		return;
	}
}

// React update: upsert the reaction group by (emoji_id, unicode). count 0
// removes the group. user_reactions are untouched.
export function reactUpdate(state: MessagesState, event: WsReactUpdate): void {
	for (const [channelId, ch] of state.channels) {
		const msg = ch.byId.get(event.message_id);
		if (!msg) {
			continue;
		}
		const key = (v: string | null) => v ?? '';
		const idx = msg.reactions.findIndex(
			(r) =>
				key(r.emoji_id) === key(event.emoji_id) &&
				key(r.unicode) === key(event.unicode)
		);
		let reactions: { emoji_id: string | null; unicode: string | null; count: number }[];
		if (event.count === 0) {
			// Remove the group (no-op if it doesn't exist yet).
			reactions = msg.reactions.filter((_, i) => i !== idx);
		} else if (idx === -1) {
			// Insert a new group (upsert).
			reactions = [
				...msg.reactions,
				{ emoji_id: event.emoji_id, unicode: event.unicode, count: event.count },
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
				ids: sortedIds(newByd),
			};
		});
		break;
	}
}

// Remove a preview from a message's previews and tombstone it, so a delayed
// REST snapshot / in-flight GET cannot resurrect it.
export function removePreview(
	state: MessagesState,
	messageId: string,
	previewId: string
): void {
	for (const [channelId, ch] of state.channels) {
		const msg = ch.byId.get(messageId);
		if (!msg) {
			continue;
		}
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
					previewTombstones: new Set([...old.previewTombstones, `${messageId}:${previewId}`]),
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
				previewTombstones: new Set([...old.previewTombstones, `${messageId}:${previewId}`]),
			};
		});
		break;
	}
}

// Link preview update: upsert (replace by id, or insert if absent) and drop
// any tombstone for this preview (this WS event is, by reception order, a
// later creation/update that must win over an earlier remove).
export function linkPreviewUpdate(
	state: MessagesState,
	event: WsLinkPreviewUpdate
): void {
	const { channel_id, message_id, preview } = event;
	const ch = state.channels.get(channel_id);
	if (!ch || !ch.byId.has(message_id)) {
		return;
	}
	const exists = ch.byId.get(message_id)!.previews.some((p) => p.id === preview.id);
	const nextPreviews = exists
		? ch.byId.get(message_id)!.previews.map((p) =>
			p.id === preview.id ? preview : p
		)
		: [...ch.byId.get(message_id)!.previews, preview];
	// Keep the full (with image_data) preview for rendering.
	previewCache.set(preview.id, preview);
	replaceChannel(state, channel_id, (old) => {
		const m = old.byId.get(message_id);
		if (!m) {
			return old;
		}
		const newByd = new SvelteMap<string, MessageWithAttachment>();
		for (const [id, mm] of old.byId) {
			newByd.set(id, mm);
		}
		newByd.set(message_id, { ...m, previews: nextPreviews });
		return {
			...old,
			byId: newByd,
			ids: sortedIds(newByd),
			previewTombstones: new Set(
				[...old.previewTombstones].filter((t) => t !== `${message_id}:${preview.id}`)
			),
		};
	});
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
		if (ch.previewTombstones.has(`${messageId}:${preview.id}`)) {
			// Tombstoned: never resurrect.
			return false;
		}
		if (msg.previews.some((pp) => pp.id === preview.id)) {
			// Already present (idempotent).
			return true;
		}
		// Keep the full (with image_data) preview for rendering.
		previewCache.set(preview.id, preview);
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
			fetched_at: preview.fetched_at,
		};
		const nextPreviews: LinkPreview[] = [...msg.previews, p];
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
			};
		});
		return true;
	}
	return false;
}

// Apply any pending preview for a message (called after the message arrives,
// so a preview resolved before the message can still be attached).
function applyPendingPreview(
	state: MessagesState,
	messageId: string
): void {
	const preview = pendingPreviews.get(messageId);
	if (!preview) {
		return;
	}
	if (mergePreview(state, messageId, preview)) {
		pendingPreviews.delete(messageId);
	}
}

// new_preview is async (needs GET /link-previews/:preview_id). The store
// fetches and applies it: if the message is already cached, immediately;
// otherwise it stays pending until the message arrives.
export function handleNewPreview(event: WsNewPreview): void {
	const { message_id, preview_id } = event;
	// Dedupe: already pending (keyed by message_id) or already in the preview
	// cache (keyed by preview_id) → nothing to do.
	if (pendingPreviews.has(message_id) || previewCache.has(preview_id)) {
		return;
	}
	api.linkPreviews
		.get(preview_id)
		.then((preview) => {
			const applied = mergePreview(state, message_id, preview);
			// Message not yet in the cache → keep it pending.
			if (!applied) {
				pendingPreviews.set(message_id, preview);
			}
		})
		.catch(() => {
			// Preview fetch failed (e.g. 404) — drop any pending entry.
			pendingPreviews.delete(message_id);
		});
}

// Attachment moderation update: patch the attachment's moderation_status.
export function attachmentModerationUpdate(
	state: MessagesState,
	event: WsAttachmentModerationUpdate
): void {
	const { channel_id, message_id, attachment_id, status } = event;
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
			ids: sortedIds(newByd),
		};
	});
}

// The pure WS reducer — single entry point for all message-related outbound
// events.
export function applyEvent(state: MessagesState, event: WsOutbound): void {
	switch (event.type) {
		case 'message': {
			// In a historical window, new WS messages are outside the window:
			// don't insert (would force scroll / bloat); just count them.
			const ch = state.channels.get(event.channel_id);
			if (ch && ch.windowMode === 'historical' && !ch.byId.has(event.id)) {
				state.channels.set(event.channel_id, {
					...ch,
					hasMoreNewer: true,
				});
			} else {
				upsertMessage(state, event.channel_id, wsMessageToMsg(event));
			}
			break;
		}
		case 'message_edit':
			patchMessage(state, event.channel_id, event.id, {
				content: event.content,
				edited_at: event.edited_at,
			});
			break;
		case 'message_delete':
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

async function _fetchPage(
	channelId: string,
	q?: { since?: string; last_id?: string }
): Promise<void> {
	if (!state.channels.has(channelId)) {
		state.channels.set(channelId, newChannelState());
	}
	const ch = state.channels.get(channelId) ?? newChannelState();
	if (ch.loading) {
		return;
	}
	const gen = (ch.requestGeneration += 1);
	ch.loading = true;
	try {
		const res = await api.messages.list(channelId, q);
		const ch2 = state.channels.get(channelId);
		// Discard if the channel was evicted/refreshed while in flight (P0.4).
		if (!ch2 || ch2.requestGeneration !== gen) {
			return;
		}
		const newByd = new SvelteMap<string, MessageWithAttachment>();
		// Re-apply tombstones to existing messages (a delayed page may
		// re-list a message that was deleted via WS after it was cached).
		for (const [id, m] of ch2.byId) {
			const merged = mergeFetchedMessage(m, m, ch2);
			if (merged) {
				newByd.set(id, merged);
			}
		}
		for (const m of res.messages) {
			const merged = mergeFetchedMessage(ch2.byId.get(m.id), m, ch2);
			if (merged) {
				newByd.set(m.id, merged);
			}
		}
		// Trim to MAX_WINDOW.
		const dropCount = newByd.size - MAX_WINDOW;
		let drop: string[] = [];
		if (dropCount > 0) {
			const ids = sortedIds(newByd);
			drop =
				ch2.windowMode === 'latest'
					? ids.slice(0, dropCount)
					: ids.slice(ids.length - dropCount);
			for (const id of drop) {
				newByd.delete(id);
			}
		}
		state.channels.set(channelId, {
			...ch2,
			byId: newByd,
			ids: sortedIds(newByd),
			loaded: true,
			loading: false,
			hasMoreOlder: res.has_more,
			cursorOlder: nextCursor(res.messages) ?? null,
			// A fresh load (q == null) is anchored at the newest message.
			...((q == null) ? { hasMoreNewer: false } : {}),
		});
	} finally {
		const ch3 = state.channels.get(channelId);
		if (ch3) {
			ch3.loading = false;
		}
	}
}

export function load(channelId: string): void {
	// Fresh load: latest 100, anchored at the newest message.
	if (!state.channels.has(channelId)) {
		state.channels.set(channelId, newChannelState());
	}
	const ch = state.channels.get(channelId)!;
	// Reset window for a fresh load.
	state.channels.set(channelId, {
		...ch,
		windowMode: 'latest',
		hasMoreNewer: false,
		deletedMessageIds: new Set(),
		previewTombstones: new Set(),
	});
	_fetchPage(channelId);
}

export function loadMoreOlder(channelId: string): void {
	const ch = state.channels.get(channelId);
	// Guard: no in-flight page + a cursor to continue from (P1.11).
	if (!ch || ch.loading || !ch.cursorOlder) {
		return;
	}
	// Navigating up → historical window.
	state.channels.set(channelId, { ...ch, windowMode: 'historical' });
	_fetchPage(channelId, {
		since: ch.cursorOlder.since,
		last_id: ch.cursorOlder.last_id,
	});
}

// Navigate back to the newest message: reconcile via REST (fresh latest page).
export function setLatest(channelId: string): void {
	load(channelId);
}

export function send(
	payload: {
		channel_id: string;
		content: string | null;
		reply_to: string | null;
		files?: File[];
	}
): Promise<MessageWithAttachment> {
	return api.messages.send(payload);
}

export function edit(
	messageId: string,
	content: string
): Promise<MessageWithAttachment> {
	return api.messages.edit(messageId, { content: content });
}

export function remove(messageId: string): Promise<void> {
	return api.messages.remove(messageId);
}

export function pin(
	channelId: string,
	messageId: string
): Promise<{ channel_id: string; message_id: string; pinned_by: string | null; pinned_at: string }> {
	return api.messages.pin(channelId, messageId);
}

export function unpin(
	channelId: string,
	messageId: string
): Promise<void> {
	return api.messages.unpin(channelId, messageId);
}

// Update the local user_reactions from the API response (the WS react_update
// only carries the count, not who reacted), then return the response.
function updateUserReactions(
	channelId: string,
	messageId: string,
	userReaction: { id?: string; emoji_id: string | null; unicode: string | null },
	remove?: boolean
): void {
	const ch = state.channels.get(channelId);
	const msg = ch?.byId.get(messageId);
	if (!ch || !msg) {
		return;
	}
	const key = (e: string | null, u: string | null) =>
		(`${e ?? ''}:${u ?? ''}`);
	let nextUserReactions: { id: string; emoji_id: string | null; unicode: string | null }[];
	if (remove) {
		nextUserReactions = msg.user_reactions.filter(
			(ur) =>
				key(ur.emoji_id, ur.unicode) !== key(userReaction.emoji_id, userReaction.unicode)
		);
	} else {
		if (userReaction.id === undefined) {
			return;
		}
		nextUserReactions = [
			...msg.user_reactions.filter(
				(ur) =>
					key(ur.emoji_id, ur.unicode) !==
					key(userReaction.emoji_id, userReaction.unicode)
			),
			{ id: userReaction.id, emoji_id: userReaction.emoji_id, unicode: userReaction.unicode },
		];
	}
	const newByd = new SvelteMap<string, MessageWithAttachment>();
	for (const [id, m] of ch.byId) {
		newByd.set(id, m);
	}
	newByd.set(messageId, { ...msg, user_reactions: nextUserReactions });
	state.channels.set(channelId, {
		...ch,
		byId: newByd,
		ids: sortedIds(newByd),
	});
}

export function react(
	channelId: string,
	messageId: string,
	req: { emoji_id: string | null; unicode: string | null }
): Promise<{
	id: string;
	user_id: string;
	emoji_id: string | null;
	unicode: string | null;
	created_at: string;
}> {
	return api.messages
		.react(channelId, messageId, req)
		.then((r) => {
			updateUserReactions(channelId, messageId, r);
			return r;
		});
}

export function unreact(
	channelId: string,
	messageId: string,
	req: { emoji_id: string | null; unicode: string | null }
): Promise<void> {
	return api.messages.unreact(channelId, messageId, req).then(() => {
		updateUserReactions(channelId, messageId, req, true);
	});
}

export function reactionUsers(
	channelId: string,
	messageId: string,
	q?: { since?: string; last_id?: string }
): Promise<{
	message_id: string;
	reactions: { emoji_id: string | null; unicode: string | null; count: number; users: { id: string; user_id: string; created_at: string }[] }[];
	has_more: boolean;
}> {
	return api.messages.reactionUsers(channelId, messageId, q);
}

export function loadPinned(channelId: string): void {
	const ch = state.channels.get(channelId);
	if (!ch) {
		return;
	}
	state.channels.set(channelId, { ...ch, pinnedLoading: true });
	api.channels.pinned(channelId).then((res) => {
		const c = state.channels.get(channelId);
		if (!c) {
			return;
		}
		state.channels.set(channelId, {
			...c,
			pinned: res.pinned,
			pinnedLoaded: true,
			pinnedLoading: false,
		});
	});
}

export function getChannel(channelId: string): ChannelMessagesState | null {
	return state.channels.get(channelId) ?? null;
}

export function getMessage(
	channelId: string,
	messageId: string
): MessageWithAttachment | null {
	const ch = state.channels.get(channelId);
	if (!ch) {
		return null;
	}
	return ch.byId.get(messageId) ?? null;
}

// Applied after a successful send/edit so the cache matches the server's
// response.
export function applySendResponse(
	channelId: string,
	msg: MessageWithAttachment
): void {
	// A send is always in the latest window.
	const ch = state.channels.get(channelId);
	if (ch) {
		state.channels.set(channelId, { ...ch, windowMode: 'latest' });
	}
	upsertMessage(state, channelId, msg);
}

// Full reset (logout / 401 / account switch) — clears every channel cache and
// the module-level preview/pending maps.
export function reset(): void {
	state.channels.clear();
	pendingPreviews.clear();
	previewCache.clear();
}

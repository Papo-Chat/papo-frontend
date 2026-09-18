// Messages store: per-channel message caches (byId + ordered ids + pinned
// list) plus the pure WS reducer (applyEvent) and keyset loading.
//
// Reactivity rule: values in a reactive map are NOT deeply reactive, so any
// change replaces the affected object via `.set(key, newObj)` — never in-place
// mutation of a stored message.

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
	WsOutbound,
	WsReactUpdate,
	WsRemovePreview,
} from '../types';

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
		hasMoreOlder: false,
		cursorOlder: null,
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

// Add or overwrite a message (dedupe by id) and re-sort.
export function upsertMessage(
	state: MessagesState,
	channelId: string,
	msg: MessageWithAttachment
): void {
	const old = state.channels.get(channelId);
	if (!old) {
		const ch = newChannelState();
		ch.byId.set(msg.id, msg);
		ch.ids = [msg.id];
		ch.loaded = true;
		state.channels.set(channelId, ch);
		return;
	}
	const newByd = new SvelteMap<string, MessageWithAttachment>();
	for (const [id, m] of old.byId) {
		newByd.set(id, m);
	}
	newByd.set(msg.id, msg);
	state.channels.set(channelId, {
		...old,
		byId: newByd,
		ids: sortedIds(newByd),
	});
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

// Remove a message from byId, ids and the pinned list.
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

// Remove a preview from a message's previews.
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
			};
		});
		break;
	}
}

// Link preview update: replace the preview (by id) in the message.
export function linkPreviewUpdate(
	state: MessagesState,
	event: WsLinkPreviewUpdate
): void {
	for (const [channelId, ch] of state.channels) {
		const msg = ch.byId.get(event.message_id);
		if (!msg) {
			continue;
		}
		const nextPreviews = msg.previews.map((p) =>
			p.id === event.preview.id ? event.preview : p
		);
		replaceChannel(state, channelId, (old) => {
			const m = old.byId.get(event.message_id);
			if (!m) {
				return old;
			}
			const newByd = new SvelteMap<string, MessageWithAttachment>();
			for (const [id, mm] of old.byId) {
				newByd.set(id, mm);
			}
			newByd.set(event.message_id, { ...m, previews: nextPreviews });
			return {
				...old,
				byId: newByd,
				ids: sortedIds(newByd),
			};
		});
		break;
	}
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

// new_preview is async (needs GET /link-previews/:preview_id). The store
// fetches and calls this to merge the resolved preview into the message.
export function mergePreview(
	state: MessagesState,
	messageId: string,
	preview: LinkPreviewWithImage
): void {
	// Message previews don't carry the embedded image_data; strip it.
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
	for (const [channelId, ch] of state.channels) {
		const msg = ch.byId.get(messageId);
		if (!msg) {
			continue;
		}
		if (msg.previews.some((pp) => pp.id === p.id)) {
			// Already present (idempotent).
			return;
		}
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
		break;
	}
}

// The pure WS reducer — single entry point for all message-related outbound
// events. `new_preview` is handled by the store (async fetch + mergePreview).
export function applyEvent(state: MessagesState, event: WsOutbound): void {
	switch (event.type) {
		case 'message':
			upsertMessage(state, event.channel_id, wsMessageToMsg(event));
			break;
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
	state.channels.delete(channelId);
}

async function _fetchPage(
	channelId: string,
	q?: { since?: string; last_id?: string }
): Promise<void> {
	if (!state.channels.has(channelId)) {
		state.channels.set(channelId, newChannelState());
	}
	const existing = state.channels.get(channelId) ?? newChannelState();
	state.channels.set(channelId, { ...existing, loading: true });

	const res = await api.messages.list(channelId, q);
	const ch = state.channels.get(channelId) ?? existing;
	const newByd = new SvelteMap<string, MessageWithAttachment>();
	for (const [id, m] of ch.byId) {
		newByd.set(id, m);
	}
	for (const m of res.messages) {
		newByd.set(m.id, m);
	}
	state.channels.set(channelId, {
		...ch,
		byId: newByd,
		ids: sortedIds(newByd),
		loaded: true,
		loading: false,
		hasMoreOlder: res.has_more,
		cursorOlder: nextCursor(res.messages) ?? null,
	});
}

export function load(channelId: string): void {
	if (!state.channels.has(channelId)) {
		state.channels.set(channelId, newChannelState());
	}
	_fetchPage(channelId);
}

export function loadMoreOlder(channelId: string): void {
	const ch = state.channels.get(channelId);
	if (!ch || !ch.cursorOlder) {
		return;
	}
	_fetchPage(channelId, {
		since: ch.cursorOlder.since,
		last_id: ch.cursorOlder.last_id,
	});
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
	return api.messages.edit(messageId, { content });
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
	return api.messages.react(channelId, messageId, req);
}

export function unreact(
	channelId: string,
	messageId: string,
	req: { emoji_id: string | null; unicode: string | null }
): Promise<void> {
	return api.messages.unreact(channelId, messageId, req);
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
	upsertMessage(state, channelId, msg);
}

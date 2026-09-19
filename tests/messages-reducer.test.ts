// Vitest on core logic: messages store reducer (applyEvent) + keyset merge.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	applyEvent,
	wsMessageToMsg,
	mergePreview,
	upsertMessage,
	removeMessage,
	patchPinned,
	reactUpdate,
	removePreview,
	linkPreviewUpdate,
	attachmentModerationUpdate,
	sortedIds,
	evict,
	load,
	loadMoreOlder,
	react,
	unreact,
	state as globalState,
	reset
} from '../src/lib/store/messages.svelte';
import type { ChannelMessagesState, MessagesState } from '../src/lib/store/messages.types';
import { SvelteMap } from 'svelte/reactivity';
import type {
	MessageWithAttachment,
	LinkPreview,
	LinkPreviewWithImage
} from '../src/lib/types/models';
import type {
	WsMessage,
	WsMessageEdit,
	WsMessageDelete,
	WsMessagePin,
	WsReactUpdate,
	WsRemovePreview,
	WsLinkPreviewUpdate,
	WsAttachmentModerationUpdate
} from '../src/lib/types/websocket';
import { messages as apiMessages } from '../src/lib/api';

// buildUrl() in api.ts reads window.location.origin.
// Stubbed per-test (afterEach un-stubs it via unstubAllGlobals).
const windowStub = {
	location: { origin: 'http://localhost:3000' }
} as unknown as Window;

beforeEach(() => {
	vi.stubGlobal('window', windowStub);
	reset();
});

// ── fixtures ─────────────────────────────────────────────

function msg(id: string, overrides: Partial<MessageWithAttachment> = {}): MessageWithAttachment {
	return {
		id,
		channel_id: 'ch1',
		author_id: 'u1',
		content: 'hello',
		created_at: '2024-01-01T00:00:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [],
		reactions: [],
		user_reactions: [],
		...overrides
	};
}

function newState(
	messages: MessageWithAttachment[] = [],
	overrides: Partial<ChannelMessagesState> = {}
): MessagesState {
	const ch: ChannelMessagesState = {
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
		pinnedGeneration: 0,
		...overrides
	};
	for (const m of messages) {
		ch.byId.set(m.id, m);
	}
	ch.ids = sortedIds(ch.byId);
	const channels = new SvelteMap<string, ChannelMessagesState>();
	channels.set('ch1', ch);
	return { channels };
}

function wsMsg(id: string, overrides: Partial<WsMessage> = {}): WsMessage {
	return {
		type: 'message',
		id,
		channel_id: 'ch1',
		author_id: 'u1',
		content: 'hi',
		created_at: '2024-01-01T00:00:00Z',
		reply_to: null,
		...overrides
	};
}

// ── wsMessageToMsg ───────────────────────────────────────

describe('wsMessageToMsg', () => {
	it('fills empty reactions/previews/user_reactions/attachments', () => {
		const m = wsMessageToMsg(wsMsg('m1'));
		expect(m.reactions).toEqual([]);
		expect(m.previews).toEqual([]);
		expect(m.user_reactions).toEqual([]);
		expect(m.attachments).toEqual([]);
		expect(m.edited_at).toBeNull();
	});

	it('maps attachments when present', () => {
		const ev = wsMsg('m1', {
			attachments: [
				{
					id: 'a1',
					mime_type: 'text/plain',
					original_file_name: 'x.txt',
					size_bytes: 10,
					thumbnail_id: null,
					created_at: '2024-01-01T00:00:00Z',
					moderation_status: 'ok'
				}
			]
		});
		const m = wsMessageToMsg(ev);
		expect(m.attachments).toHaveLength(1);
	});
});

// ── applyEvent(message): append / dedupe / sort ──────────

describe('applyEvent(message)', () => {
	it('appends a new message (creates the channel if absent)', () => {
		const state = newState();
		applyEvent(state, wsMsg('m1'));
		const ch = state.channels.get('ch1');
		expect(ch).toBeDefined();
		expect(ch!.ids).toEqual(['m1']);
		expect(ch!.byId.size).toBe(1);
	});

	it('dedupes a message that already exists (same id)', () => {
		const state = newState([msg('m1')]);
		applyEvent(state, wsMsg('m1'));
		const ch = state.channels.get('ch1')!;
		expect(ch.byId.size).toBe(1);
		expect(ch.ids).toHaveLength(1);
	});

	it('sorts ids by (created_at, id)', () => {
		const state = newState();
		applyEvent(state, wsMsg('m2', { created_at: '2024-01-01T00:00:02Z' }));
		applyEvent(state, wsMsg('m1', { created_at: '2024-01-01T00:00:00Z' }));
		expect(state.channels.get('ch1')!.ids).toEqual(['m1', 'm2']);
	});
});

// ── applyEvent(message_edit) ─────────────────────────────

describe('applyEvent(message_edit)', () => {
	it('patches content and edited_at', () => {
		const state = newState([msg('m1')]);
		applyEvent(state, {
			type: 'message_edit',
			id: 'm1',
			channel_id: 'ch1',
			content: 'edited',
			edited_at: '2024-01-02T00:00:00Z'
		} satisfies WsMessageEdit);
		const m = state.channels.get('ch1')!.byId.get('m1')!;
		expect(m.content).toBe('edited');
		expect(m.edited_at).toBe('2024-01-02T00:00:00Z');
	});

	it('does nothing for an unknown message id', () => {
		const state = newState([msg('m1')]);
		applyEvent(state, {
			type: 'message_edit',
			id: 'm9',
			channel_id: 'ch1',
			content: 'edited',
			edited_at: '2024-01-02T00:00:00Z'
		} satisfies WsMessageEdit);
		expect(state.channels.get('ch1')!.byId.get('m1')!.content).toBe('hello');
	});
});

// ── applyEvent(message_delete) ───────────────────────────

describe('applyEvent(message_delete)', () => {
	it('removes from byId, ids and pinned', () => {
		const state = newState([msg('m1'), msg('m2')]);
		const ch0 = state.channels.get('ch1')!;
		ch0.pinned = [ch0.byId.get('m1')!];
		applyEvent(state, {
			type: 'message_delete',
			id: 'm1',
			channel_id: 'ch1'
		} satisfies WsMessageDelete);
		const ch = state.channels.get('ch1')!;
		expect(ch.byId.size).toBe(1);
		expect(ch.ids).toEqual(['m2']);
		expect(ch.byId.has('m1')).toBe(false);
		expect(ch.pinned.length).toBe(0);
	});

	it('is a no-op for an unknown message id', () => {
		const state = newState([msg('m1')]);
		applyEvent(state, {
			type: 'message_delete',
			id: 'm9',
			channel_id: 'ch1'
		} satisfies WsMessageDelete);
		expect(state.channels.get('ch1')!.byId.size).toBe(1);
	});
});

// ── applyEvent(message_pin) ──────────────────────────────

describe('applyEvent(message_pin)', () => {
	it('pins a message (appends to pinned)', () => {
		const state = newState([msg('m1'), msg('m2')]);
		applyEvent(state, {
			type: 'message_pin',
			message_id: 'm1',
			is_pinned: true
		} satisfies WsMessagePin);
		expect(state.channels.get('ch1')!.pinned).toHaveLength(1);
		expect(state.channels.get('ch1')!.pinned[0].id).toBe('m1');
	});

	it('unpins a message (removes from pinned)', () => {
		const state = newState([msg('m1'), msg('m2')]);
		const ch0 = state.channels.get('ch1')!;
		ch0.pinned = [ch0.byId.get('m1')!];
		applyEvent(state, {
			type: 'message_pin',
			message_id: 'm1',
			is_pinned: false
		} satisfies WsMessagePin);
		expect(state.channels.get('ch1')!.pinned).toHaveLength(0);
	});

	it('does not duplicate on a repeated pin', () => {
		const state = newState([msg('m1')]);
		const ev: WsMessagePin = { type: 'message_pin', message_id: 'm1', is_pinned: true };
		applyEvent(state, ev);
		applyEvent(state, ev);
		expect(state.channels.get('ch1')!.pinned).toHaveLength(1);
	});

	it('is a no-op for an unknown message id', () => {
		const state = newState([msg('m1')]);
		applyEvent(state, {
			type: 'message_pin',
			message_id: 'm9',
			is_pinned: true
		} satisfies WsMessagePin);
		expect(state.channels.get('ch1')!.pinned).toHaveLength(0);
	});
});

// ── applyEvent(react_update) ─────────────────────────────

describe('applyEvent(react_update)', () => {
	it('updates an existing reaction count', () => {
		const state = newState([
			msg('m1', { reactions: [{ emoji_id: 'e1', unicode: null, count: 2 }] })
		]);
		applyEvent(state, {
			type: 'react_update',
			message_id: 'm1',
			emoji_id: 'e1',
			unicode: null,
			count: 5
		} satisfies WsReactUpdate);
		expect(state.channels.get('ch1')!.byId.get('m1')!.reactions).toEqual([
			{ emoji_id: 'e1', unicode: null, count: 5 }
		]);
	});

	it('removes a reaction group when count is 0', () => {
		const state = newState([
			msg('m1', {
				reactions: [
					{ emoji_id: 'e1', unicode: null, count: 2 },
					{ emoji_id: 'e2', unicode: null, count: 1 }
				]
			})
		]);
		applyEvent(state, {
			type: 'react_update',
			message_id: 'm1',
			emoji_id: 'e1',
			unicode: null,
			count: 0
		} satisfies WsReactUpdate);
		expect(state.channels.get('ch1')!.byId.get('m1')!.reactions).toEqual([
			{ emoji_id: 'e2', unicode: null, count: 1 }
		]);
	});

	it('inserts a new reaction group when count > 0 and absent (upsert)', () => {
		const state = newState([msg('m1', { reactions: [] })]);
		applyEvent(state, {
			type: 'react_update',
			message_id: 'm1',
			emoji_id: 'e9',
			unicode: null,
			count: 1
		} satisfies WsReactUpdate);
		expect(state.channels.get('ch1')!.byId.get('m1')!.reactions).toEqual([
			{ emoji_id: 'e9', unicode: null, count: 1 }
		]);
	});

	it('does not touch user_reactions', () => {
		const state = newState([
			msg('m1', {
				reactions: [{ emoji_id: 'e1', unicode: null, count: 2 }],
				user_reactions: [{ id: 'ur1', emoji_id: 'e1', unicode: null }]
			})
		]);
		applyEvent(state, {
			type: 'react_update',
			message_id: 'm1',
			emoji_id: 'e1',
			unicode: null,
			count: 3
		} satisfies WsReactUpdate);
		expect(state.channels.get('ch1')!.byId.get('m1')!.user_reactions).toEqual([
			{ id: 'ur1', emoji_id: 'e1', unicode: null }
		]);
	});

	it('distinguishes (emoji_id, unicode) keys', () => {
		const state = newState([
			msg('m1', {
				reactions: [
					{ emoji_id: 'e1', unicode: null, count: 2 },
					{ emoji_id: 'e1', unicode: 'x', count: 1 }
				]
			})
		]);
		applyEvent(state, {
			type: 'react_update',
			message_id: 'm1',
			emoji_id: 'e1',
			unicode: null,
			count: 9
		} satisfies WsReactUpdate);
		expect(state.channels.get('ch1')!.byId.get('m1')!.reactions).toEqual([
			{ emoji_id: 'e1', unicode: null, count: 9 },
			{ emoji_id: 'e1', unicode: 'x', count: 1 }
		]);
	});
});

// ── applyEvent(remove_preview / link_preview_update) ─────

describe('applyEvent(remove_preview)', () => {
	it('removes a preview by id (leaves others)', () => {
		const state = newState([
			msg('m1', {
				previews: [preview('p1'), preview('p2')]
			})
		]);
		applyEvent(state, {
			type: 'remove_preview',
			message_id: 'm1',
			preview_id: 'p1'
		} satisfies WsRemovePreview);
		expect(state.channels.get('ch1')!.byId.get('m1')!.previews).toEqual([preview('p2')]);
	});

	it('is a no-op when the preview is absent', () => {
		const state = newState([msg('m1', { previews: [preview('p1')] })]);
		applyEvent(state, {
			type: 'remove_preview',
			message_id: 'm1',
			preview_id: 'missing'
		} satisfies WsRemovePreview);
		expect(state.channels.get('ch1')!.byId.get('m1')!.previews).toHaveLength(1);
	});
});

describe('applyEvent(link_preview_update)', () => {
	it('replaces a preview by id (others untouched)', () => {
		const state = newState([
			msg('m1', {
				previews: [preview('p1'), preview('p2')]
			})
		]);
		applyEvent(state, {
			type: 'link_preview_update',
			channel_id: 'ch1',
			message_id: 'm1',
			preview: { ...preview('p2'), title: 'updated', image_data: null }
		} satisfies WsLinkPreviewUpdate);
		const previews = state.channels.get('ch1')!.byId.get('m1')!.previews;
		expect(previews[0].id).toBe('p1');
		expect(previews[0].title).toBe('old p1');
		expect(previews[1].id).toBe('p2');
		expect(previews[1].title).toBe('updated');
	});
});

// ── mergePreview (new_preview resolution) ───────────────

describe('mergePreview', () => {
	it('adds a resolved preview to a message', () => {
		const state = newState([msg('m1')]);
		mergePreview(state, 'm1', {
			id: 'p1',
			url: 'https://example.com',
			kind: 'article',
			title: 'T',
			description: 'D',
			provider_name: 'P',
			embed_url: null,
			image_mime_type: null,
			image_size_bytes: null,
			fetched_at: '2024-01-01T00:00:00Z',
			image_data: 'b64'
		});
		const previews = state.channels.get('ch1')!.byId.get('m1')!.previews;
		expect(previews).toHaveLength(1);
		// image_data is stripped from the stored LinkPreview.
		expect('image_data' in previews[0]).toBe(false);
	});

	it('is idempotent (same id not added twice)', () => {
		const state = newState([msg('m1')]);
		const p: LinkPreviewWithImage = {
			...preview('p1'),
			image_data: 'b64'
		};
		mergePreview(state, 'm1', p);
		mergePreview(state, 'm1', p);
		expect(state.channels.get('ch1')!.byId.get('m1')!.previews).toHaveLength(1);
	});
});

// ── applyEvent(attachment_moderation_update) ─────────────

describe('applyEvent(attachment_moderation_update)', () => {
	it('patches the attachment moderation_status', () => {
		const state = newState([
			msg('m1', {
				attachments: [
					{
						id: 'a1',
						mime_type: 'image/png',
						original_file_name: 'x.png',
						size_bytes: 100,
						thumbnail_id: null,
						created_at: '2024-01-01T00:00:00Z',
						moderation_status: 'pending'
					}
				]
			})
		]);
		applyEvent(state, {
			type: 'attachment_moderation_update',
			channel_id: 'ch1',
			message_id: 'm1',
			attachment_id: 'a1',
			status: 'removed'
		} satisfies WsAttachmentModerationUpdate);
		const a = state.channels.get('ch1')!.byId.get('m1')!.attachments[0];
		expect(a.moderation_status).toBe('removed');
	});

	it('is a no-op when the channel/message/attachment is absent', () => {
		const state = newState([msg('m1')]);
		applyEvent(state, {
			type: 'attachment_moderation_update',
			channel_id: 'ch1',
			message_id: 'm1',
			attachment_id: 'a9',
			status: 'removed'
		} satisfies WsAttachmentModerationUpdate);
		expect(state.channels.get('ch1')!.byId.get('m1')!.attachments).toHaveLength(0);
	});
});

// ── keyset merge of REST pages ──────────────────────────

describe('keyset merge of REST pages (load / loadMoreOlder)', () => {
	beforeEach(() => {
		vi.spyOn(apiMessages, 'list');
	});

	afterEach(() => {
		evict('ch_k');
		vi.restoreAllMocks();
	});

	it('initial load populates byId, sorted ids and cursorOlder', async () => {
		const newest = msg('m2', { created_at: '2024-01-01T00:00:02Z' });
		const older = msg('m1', { created_at: '2024-01-01T00:00:00Z' });
		vi.mocked(apiMessages.list).mockResolvedValue({
			channel_id: 'ch_k',
			messages: [newest, older], // API returns DESC (newest first)
			has_more: true
		});
		load('ch_k');
		await vi.waitFor(() => {
			const ch = globalState.channels.get('ch_k');
			return !!ch && ch.byId.size === 2;
		});
		const ch = globalState.channels.get('ch_k')!;
		// ids are re-sorted ascending by (created_at, id).
		expect(ch.ids).toEqual(['m1', 'm2']);
		expect(ch.loaded).toBe(true);
		expect(ch.hasMoreOlder).toBe(true);
		// cursor = oldest of the page = (m1.created_at, m1).
		expect(ch.cursorOlder).toEqual({ since: '2024-01-01T00:00:00Z', last_id: 'm1' });
	});

	it('loadMoreOlder merges an older page (dedupe + sort + new cursor)', async () => {
		// First page.
		const newest = msg('m2', { created_at: '2024-01-01T00:00:02Z' });
		const older = msg('m1', { created_at: '2024-01-01T00:00:00Z' });
		vi.mocked(apiMessages.list).mockResolvedValue({
			channel_id: 'ch_k',
			messages: [newest, older],
			has_more: true
		});
		load('ch_k');
		await vi.waitFor(() => {
			const ch = globalState.channels.get('ch_k');
			return !!ch && ch.byId.size === 2;
		});

		// Second (older) page: re-adds m1 (dedupe) plus a newer-older m0.
		const m0 = msg('m0', { created_at: '2024-01-01T00:00:01Z' });
		vi.mocked(apiMessages.list).mockResolvedValue({
			channel_id: 'ch_k',
			messages: [older, m0],
			has_more: false
		});
		loadMoreOlder('ch_k');
		await vi.waitFor(() => {
			const ch = globalState.channels.get('ch_k');
			return !!ch && ch.byId.size === 3;
		});

		const ch = globalState.channels.get('ch_k')!;
		// m1 deduped (still one entry); sorted ascending by created_at:
		// m1 (:00Z) < m0 (:01Z) < m2 (:02Z).
		expect(ch.ids).toEqual(['m1', 'm0', 'm2']);
		expect(ch.byId.size).toBe(3);
		expect(ch.hasMoreOlder).toBe(false);
		// cursor = oldest of the new page = m0.
		expect(ch.cursorOlder).toEqual({ since: '2024-01-01T00:00:01Z', last_id: 'm0' });
	});
});

// ── REST↔WS merge edge cases (P0.4, P0.5) ──────────────

describe('mergeFetchedMessage: REST does not clobber newer WS deltas', () => {
	it('a delayed REST page does not revert a newer WS react_update count', () => {
		const state = newState([
			msg('m1', { reactions: [{ emoji_id: 'e1', unicode: null, count: 2 }] })
		]);
		applyEvent(state, {
			type: 'react_update',
			message_id: 'm1',
			emoji_id: 'e1',
			unicode: null,
			count: 9
		} satisfies WsReactUpdate);
		// Delayed REST returns the stale message (count 2).
		upsertMessage(state, 'ch1', {
			...msg('m1'),
			reactions: [{ emoji_id: 'e1', unicode: null, count: 2 }]
		});
		expect(state.channels.get('ch1')!.byId.get('m1')!.reactions).toEqual([
			{ emoji_id: 'e1', unicode: null, count: 9 }
		]);
	});

	it('a delayed REST page does not resurrect a WS-deleted message', () => {
		const state = newState([msg('m1')]);
		applyEvent(state, {
			type: 'message_delete',
			id: 'm1',
			channel_id: 'ch1'
		} satisfies WsMessageDelete);
		upsertMessage(state, 'ch1', msg('m1'));
		expect(state.channels.get('ch1')!.byId.has('m1')).toBe(false);
	});
});

describe('preview tombstones (P0.5)', () => {
	it('remove_preview blocks a later preview GET from resurrecting the preview', () => {
		const state = newState([msg('m1', { previews: [preview('p1')] })]);
		applyEvent(state, {
			type: 'remove_preview',
			message_id: 'm1',
			preview_id: 'p1'
		} satisfies WsRemovePreview);
		mergePreview(state, 'm1', { ...preview('p1'), image_data: 'b64' });
		expect(state.channels.get('ch1')!.byId.get('m1')!.previews).toHaveLength(0);
	});

	it('link_preview_update after remove_preview re-adds the preview (WS order wins)', () => {
		const state = newState([msg('m1', { previews: [preview('p1')] })]);
		applyEvent(state, {
			type: 'remove_preview',
			message_id: 'm1',
			preview_id: 'p1'
		} satisfies WsRemovePreview);
		linkPreviewUpdate(state, {
			type: 'link_preview_update',
			channel_id: 'ch1',
			message_id: 'm1',
			preview: { ...preview('p1'), title: 're-added', image_data: 'b64' }
		} satisfies WsLinkPreviewUpdate);
		const previews = state.channels.get('ch1')!.byId.get('m1')!.previews;
		expect(previews).toHaveLength(1);
		expect(previews[0].id).toBe('p1');
		expect(previews[0].title).toBe('re-added');
	});
});

// ── user_reactions (P0.6) ───────────────────────────────

describe('react / unreact (user_reactions)', () => {
	beforeEach(() => {
		vi.spyOn(apiMessages, 'react');
		vi.spyOn(apiMessages, 'unreact');
		// react/unreact operate on the module-level state.
		const ch: ChannelMessagesState = {
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
		ch.byId.set('m1', msg('m1', { user_reactions: [] }));
		ch.ids = ['m1'];
		globalState.channels.set('ch1', ch);
	});

	afterEach(() => {
		globalState.channels.clear();
		vi.restoreAllMocks();
	});

	it('react() adds the user reaction; unreact() removes it', async () => {
		vi.mocked(apiMessages.react).mockResolvedValue({
			id: 'ur1',
			user_id: 'u1',
			emoji_id: 'e1',
			unicode: null,
			created_at: '2024-01-01T00:00:00Z'
		});
		await react('ch1', 'm1', { emoji_id: 'e1', unicode: null });
		expect(globalState.channels.get('ch1')!.byId.get('m1')!.user_reactions).toEqual([
			{ id: 'ur1', emoji_id: 'e1', unicode: null }
		]);
		vi.mocked(apiMessages.unreact).mockResolvedValue(undefined);
		await unreact('ch1', 'm1', { emoji_id: 'e1', unicode: null });
		expect(globalState.channels.get('ch1')!.byId.get('m1')!.user_reactions).toEqual([]);
	});
});

// ── 300-message window (P1.12) ──────────────────────────

describe('300-message window', () => {
	it('trims a fresh load to the 300 newest messages (P1.12)', async () => {
		evict('ch_k');
		vi.spyOn(apiMessages, 'list');
		const messages: MessageWithAttachment[] = [];
		for (let i = 0; i < 350; i++) {
			messages.push({
				...msg(`m${i}`, {
					created_at: new Date(Date.UTC(2024, 0, 1) + i * 60_000).toISOString()
				})
			});
		}
		vi.mocked(apiMessages.list).mockResolvedValue({
			channel_id: 'ch_k',
			messages,
			has_more: false
		});
		load('ch_k');
		await vi.waitFor(() => {
			const ch = globalState.channels.get('ch_k');
			return !!ch && ch.byId.size === 300;
		});
		const ch = globalState.channels.get('ch_k')!;
		expect(ch.byId.size).toBe(300);
		// Oldest 50 dropped; the 300 newest remain.
		expect(ch.byId.has('m0')).toBe(false);
		expect(ch.byId.has('m49')).toBe(false);
		expect(ch.byId.has('m50')).toBe(true);
		expect(ch.byId.has('m349')).toBe(true);
		evict('ch_k');
		vi.restoreAllMocks();
	});
});

// ── helpers ─────────────────────────────────────────────

function preview(id: string): LinkPreview {
	return {
		id,
		url: `https://example.com/${id}`,
		kind: 'article',
		title: `old ${id}`,
		description: null,
		provider_name: null,
		embed_url: null,
		image_mime_type: null,
		image_size_bytes: null,
		fetched_at: '2024-01-01T00:00:00Z'
	};
}

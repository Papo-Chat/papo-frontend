import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SvelteMap } from 'svelte/reactivity';
import { api } from '../src/lib/api';
import type { NotificationSummary, MessageWithAttachment } from '../src/lib/types';
import type { ChannelMessagesState } from '../src/lib/store/messages.types';
import * as messagesStore from '../src/lib/store/messages.svelte';
import * as notificationsStore from '../src/lib/store/notifications.svelte';
import * as sessionStore from '../src/lib/store/session.svelte';

function message(id: string, created_at: string): MessageWithAttachment {
	return {
		id,
		channel_id: 'dm-1',
		author_id: 'user-2',
		content: id,
		created_at,
		edited_at: null,
		reply_to: null,
		attachments: [],
		embeds: [],
		reactions: [],
		user_reactions: []
	};
}

function notification(
	id: string,
	message_id: string,
	created_at: string
): NotificationSummary {
	return {
		id,
		message_id,
		channel_id: 'dm-1',
		author_id: 'user-2',
		message_content: message_id,
		read: false,
		created_at
	};
}

function seedMessageWindow(): void {
	const messages = [
		message('m1', '2026-10-27T10:00:00.000Z'),
		message('m2', '2026-10-27T10:00:02.000Z')
	];
	const byId = new SvelteMap<string, MessageWithAttachment>();
	for (const item of messages) byId.set(item.id, item);
	const channel: ChannelMessagesState = {
		byId,
		ids: ['m1', 'm2'],
		loaded: true,
		loading: false,
		windowMode: 'latest',
		hasMoreOlder: false,
		hasMoreNewer: false,
		cursorOlder: null,
		cursorNewer: null,
		requestGeneration: 0,
		deletedMessageIds: new Set(),
		embedTombstones: new Set(),
		pinned: [],
		pinnedLoaded: true,
		pinnedLoading: false,
		pinnedGeneration: 0
	};
	messagesStore.state.channels.set('dm-1', channel);
}

beforeEach(() => {
	messagesStore.reset();
	notificationsStore.reset();
	sessionStore.state.userId = 'user-1';
});

afterEach(() => {
	vi.restoreAllMocks();
	notificationsStore.reset();
	messagesStore.reset();
	sessionStore.state.userId = null;
});

describe('DM notification read reconciliation', () => {
	it('keeps notifications read when a stale refetch races the debounced read request', async () => {
		seedMessageWindow();
		const readNotification = notification('n1', 'm1', '2026-10-27T10:00:01.000Z');
		const newerNotification = notification('n2', 'm2', '2026-10-27T10:00:03.000Z');
		notificationsStore.state.items = [readNotification, newerNotification];
		notificationsStore.state.loaded = true;
		notificationsStore.state.unreadCount = 2;

		// Reading m1 optimistically clears its notification even though the
		// notification timestamp was recorded just after the message timestamp.
		notificationsStore.markChannelRead('dm-1', 'm1', '2026-10-27T10:00:00.000Z');
		expect(notificationsStore.state.items.find((item) => item.id === 'n1')?.read).toBe(true);
		expect(notificationsStore.state.items.find((item) => item.id === 'n2')?.read).toBe(false);
		expect(notificationsStore.state.unreadCount).toBe(1);

		// This response is stale: the server has not processed the debounced
		// channel/DM read yet, and would otherwise reintroduce n1 as unread.
		vi.spyOn(api.users, 'notifications').mockResolvedValue({
			notifications: [readNotification, newerNotification],
			has_more: false
		});
		notificationsStore.load();

		await vi.waitFor(() => {
			expect(notificationsStore.state.items.find((item) => item.id === 'n1')?.read).toBe(true);
			expect(notificationsStore.state.items.find((item) => item.id === 'n2')?.read).toBe(false);
		});
		expect(notificationsStore.state.unreadCount).toBe(1);
	});
});

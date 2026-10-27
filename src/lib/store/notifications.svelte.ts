// Notifications store: the notification list (keyset, 100/page) plus
// mark-read and the live unread counter.

import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { api, ApiError } from '../api';
import { debounce } from '../utils/throttle';
import { meId as sessionMeId } from '../store/session.svelte';
import { currentSessionEpoch, isCurrentSessionEpoch } from '../utils/session-epoch';
import { nextCursor } from '../utils/keyset';
import * as messagesStore from './messages.svelte';
import type { NotificationSummary, KeysetCursor } from '../types';

export const state = $state({
	items: [] as NotificationSummary[],
	hasMore: false,
	cursor: null as KeysetCursor | null,
	// Live unread badge counter. Seeded from the REST list on first load,
	// then driven by WS (new_notification → +1) and markRead (−updated).
	unreadCount: 0,
	loading: false,
	loaded: false,
	// Guards against concurrent load/loadMore (P1.11).
	loadGeneration: 0
});

type ChannelReadMarker = {
	messageId: string;
	messageCreatedAt: string;
};

// Preserve locally acknowledged read positions across notification refetches.
// A new_notification refetch can race the debounced channel/DM read request
// and otherwise replace optimistic read rows with a stale server copy.
const channelReadMarkers = new SvelteMap<string, ChannelReadMarker>();

function isAtOrBeforeReadMarker(
	notification: NotificationSummary,
	channelId: string,
	marker: ChannelReadMarker
): boolean {
	const window = messagesStore.getChannel(channelId);
	const readIndex = window ? window.ids.indexOf(marker.messageId) : -1;
	const notificationIndex = window ? window.ids.indexOf(notification.message_id) : -1;

	if (readIndex >= 0 && notificationIndex >= 0) {
		return notificationIndex <= readIndex;
	}
	// Notification timestamps can lag their message timestamps slightly. Keep
	// the same fallback used for rows whose messages are outside the cache.
	return notification.created_at <= marker.messageCreatedAt;
}

function reconcileReadMarkers(
	notifications: NotificationSummary[],
	previouslyReadIds: Set<string> = new Set(state.items.filter((n) => n.read).map((n) => n.id))
): { items: NotificationSummary[]; newlyRead: number } {
	let newlyRead = 0;
	const items = notifications.map((notification) => {
		if (notification.read) return notification;
		const marker = channelReadMarkers.get(notification.channel_id);
		if (!marker || !isAtOrBeforeReadMarker(notification, notification.channel_id, marker)) {
			return notification;
		}
		if (!previouslyReadIds.has(notification.id)) newlyRead += 1;
		return { ...notification, read: true };
	});
	return { items, newlyRead };
}

// Debounced refetch after a new_notification (F3).
const refetch = debounce(() => {
	load();
}, 500);

export function load(): void {
	const userId = sessionMeId();
	if (!userId) {
		return;
	}
	const gen = (state.loadGeneration += 1);
	state.loading = true;
	api.users
		.notifications(userId)
		.then((res) => {
			// Discard if a newer load/loadMore started in the meantime (P1.11).
			if (state.loadGeneration !== gen) {
				return;
			}
			const wasLoaded = state.loaded;
			const reconciled = reconcileReadMarkers(res.notifications);
			state.items = reconciled.items;
			state.hasMore = res.has_more;
			state.cursor = nextCursor(res.notifications) ?? null;
			// Seed on first load; on refetches, remove only rows newly resolved as
			// read by a marker. Rows already optimistically read were decremented
			// at markChannelRead time and must not decrement the badge twice.
			if (!wasLoaded) {
				state.unreadCount = reconciled.items.filter((n) => !n.read).length;
			} else if (reconciled.newlyRead > 0) {
				state.unreadCount = Math.max(0, state.unreadCount - reconciled.newlyRead);
			}
			state.loaded = true;
		})
		.finally(() => {
			if (state.loadGeneration === gen) {
				state.loading = false;
			}
		});
}

export function loadMore(): void {
	const userId = sessionMeId();
	// Guard: no in-flight page + a cursor to continue from (P1.11).
	if (!userId || state.loading || !state.cursor) {
		return;
	}
	const gen = (state.loadGeneration += 1);
	api.users
		.notifications(userId, {
			since: state.cursor.since,
			last_id: state.cursor.last_id
		})
		.then((res) => {
			if (state.loadGeneration !== gen) {
				return;
			}
			// Append, deduping by notification id.
			const seen = new SvelteSet(state.items.map((n) => n.id));
			const fresh = res.notifications.filter((n) => !seen.has(n.id));
			state.items = [...state.items, ...reconcileReadMarkers(fresh).items];
			state.hasMore = res.has_more;
			state.cursor = nextCursor(res.notifications) ?? null;
		});
}

export function markRead(ids: string[]): void {
	const userId = sessionMeId();
	if (!userId || ids.length === 0) {
		return;
	}
	const idSet = new SvelteSet(ids);
	// O contador local é incrementado otimisticamente (new_notification). O
	// `updated` do servidor só conta linhas que realmente mudaram: quando a
	// notificação já estava lida no servidor (updated < local), o contador
	// local precisa ser decrementado igualmente — senão o badge fica preso
	// e só um F5 (re-seed) o corrige.
	const locallyUnread = state.items.filter((n) => !n.read && idSet.has(n.id)).length;
	const epoch = currentSessionEpoch();
	const markLocal = (): void => {
		state.items = state.items.map((n) => (idSet.has(n.id) ? { ...n, read: true } : n));
	};
	api.users
		.markRead(userId, { notification_ids: ids })
		.then((res) => {
			if (!isCurrentSessionEpoch(epoch)) {
				return;
			}
			markLocal();
			state.unreadCount = Math.max(
				0,
				state.unreadCount - Math.max(res.updated, locallyUnread)
			);
		})
		.catch((err: unknown) => {
			// 404 (notification not found): todas as ids já estavam lidas no
			// servidor. Reconcilia o estado local para o badge não travar.
			if (err instanceof ApiError && err.status === 404) {
				markLocal();
				state.unreadCount = Math.max(0, state.unreadCount - locallyUnread);
			}
		});
}

// new_notification (F3): the id may be ephemeral — never insert the event
// payload as a row. Just bump the live counter and refetch.
export function markAllRead(): void {
	const ids = state.items.filter((notification) => !notification.read).map((notification) => notification.id);
	for (let offset = 0; offset < ids.length; offset += 1000) {
		markRead(ids.slice(offset, offset + 1000));
	}
}

// last_read atualizado (canal/DM): notificações daquele canal até a mensagem
// lida são consideradas lidas (espelha a regra aplicada no backend).
export function markChannelRead(channelId: string, messageId: string, messageCreatedAt: string): void {
	const previous = channelReadMarkers.get(channelId);
	if (!previous || Date.parse(messageCreatedAt) >= Date.parse(previous.messageCreatedAt)) {
		channelReadMarkers.set(channelId, { messageId, messageCreatedAt });
	}

	const marker = channelReadMarkers.get(channelId)!;
	let changed = 0;
	state.items = state.items.map((notification) => {
		if (notification.read || notification.channel_id !== channelId) return notification;
		if (!isAtOrBeforeReadMarker(notification, channelId, marker)) return notification;
		changed += 1;
		return { ...notification, read: true };
	});
	if (changed > 0) {
		state.unreadCount = Math.max(0, state.unreadCount - changed);
	}
}

export function handleNewNotification(): void {
	state.unreadCount += 1;
	refetch.run();
}

export function removeByMessage(messageId: string): void {
	const removed = state.items.filter((notification) => notification.message_id === messageId);
	if (removed.length === 0) return;

	const unreadRemoved = removed.filter((notification) => !notification.read).length;
	state.items = state.items.filter((notification) => notification.message_id !== messageId);
	state.unreadCount = Math.max(0, state.unreadCount - unreadRemoved);
}

// Full reset (logout / 401 / account switch).
export function reset(): void {
	state.loadGeneration += 1;
	channelReadMarkers.clear();
	state.items = [];
	state.hasMore = false;
	state.cursor = null;
	state.unreadCount = 0;
	state.loading = false;
	state.loaded = false;
}

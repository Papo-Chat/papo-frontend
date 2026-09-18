// Notifications store: the notification list (keyset, 100/page) plus
// mark-read and the live unread counter.

import { api } from '../api';
import { debounce } from '../utils/throttle';
import { meId as sessionMeId } from '../store/session.svelte';
import { nextCursor } from '../utils/keyset';
import type {
	NotificationSummary,
	KeysetCursor,
	WsNewNotification,
} from '../types';

export const state = $state({
	items: [] as NotificationSummary[],
	hasMore: false,
	cursor: null as KeysetCursor | null,
	// Live unread badge counter. Seeded from the REST list on first load,
	// then driven by WS (new_notification → +1) and markRead (−updated).
	unreadCount: 0,
	loading: false,
	loaded: false,
});

// Debounced refetch after a new_notification (F3).
const refetch = debounce(() => {
	load();
}, 500);

export function load(): void {
	const userId = sessionMeId();
	if (!userId) {
		return;
	}
	state.loading = true;
	api.users
		.notifications(userId)
		.then((res) => {
			state.items = res.notifications;
			state.hasMore = res.has_more;
			state.cursor = nextCursor(res.notifications) ?? null;
			// Seed the unread counter only on the first load.
			if (!state.loaded) {
				state.unreadCount = res.notifications.filter((n) => !n.read).length;
			}
			state.loaded = true;
		})
		.finally(() => {
			state.loading = false;
		});
}

export function loadMore(): void {
	const userId = sessionMeId();
	if (!userId || !state.cursor) {
		return;
	}
	api.users
		.notifications(userId, {
			since: state.cursor.since,
			last_id: state.cursor.last_id,
		})
		.then((res) => {
			state.items = [...state.items, ...res.notifications];
			state.hasMore = res.has_more;
			state.cursor = nextCursor(res.notifications) ?? null;
		});
}

export function markRead(ids: string[]): void {
	const userId = sessionMeId();
	if (!userId || ids.length === 0) {
		return;
	}
	api.users
		.markRead(userId, { notification_ids: ids })
		.then((res) => {
			state.items = state.items.map((n) =>
				ids.includes(n.id) ? { ...n, read: true } : n
			);
			state.unreadCount = Math.max(0, state.unreadCount - res.updated);
		});
}

// new_notification (F3): the id may be ephemeral — never insert the event
// payload as a row. Just bump the live counter and refetch.
export function handleNewNotification(_event: WsNewNotification): void {
	state.unreadCount += 1;
	refetch.run();
}

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
	// Guards against concurrent load/loadMore (P1.11).
	loadGeneration: 0,
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
	const gen = (state.loadGeneration += 1);
	state.loading = true;
	api.users
		.notifications(userId)
		.then((res) => {
			// Discard if a newer load/loadMore started in the meantime (P1.11).
			if (state.loadGeneration !== gen) {
				return;
			}
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
			last_id: state.cursor.last_id,
		})
		.then((res) => {
			if (state.loadGeneration !== gen) {
				return;
			}
			// Append, deduping by notification id.
			const seen = new Set(state.items.map((n) => n.id));
			const fresh = res.notifications.filter((n) => !seen.has(n.id));
			state.items = [...state.items, ...fresh];
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

// Full reset (logout / 401 / account switch).
export function reset(): void {
	state.items = [];
	state.hasMore = false;
	state.cursor = null;
	state.unreadCount = 0;
	state.loading = false;
	state.loaded = false;
	state.loadGeneration = 0;
}

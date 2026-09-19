// Shared (reusable) types for the messages store. Kept separate so the pure
// reducer helpers and tests can reference them without importing the store.

import { SvelteMap } from 'svelte/reactivity';
import type { MessageWithAttachment } from '../types';
import type { KeysetCursor } from '../utils/keyset';

export interface ChannelMessagesState {
	// Message cache keyed by message id (SvelteMap → reactive in the browser,
	// plain Map in node/Vitest).
	byId: SvelteMap<string, MessageWithAttachment>;
	// Message ids ordered by (created_at, id) — the display order.
	ids: string[];
	loaded: boolean;
	loading: boolean;
	// ── window policy (P1.12) ─────────────────────────────
	// 'latest': anchored at the newest message. 'historical': the user scrolled
	// up into older content; new WS messages must not be inserted (just counted
	// via hasMoreNewer).
	windowMode: 'latest' | 'historical';
	// Whether there are older messages beyond the window (REST cursor).
	hasMoreOlder: boolean;
	// Whether there are newer messages outside the window (set while in
	// 'historical' mode; cleared on load/setLatest).
	hasMoreNewer: boolean;
	// Keyset cursor for loading older messages.
	cursorOlder: KeysetCursor | null;
	// ── REST vs WS: a delayed REST snapshot must not clobber newer WS deltas
	// (deleted/tombstoned messages, removed previews). ───────────────────────
	// Incremented on every load/loadMore; captured before the await so a
	// page that resolves after the channel was evicted/refreshed is discarded.
	requestGeneration: number;
	// Message ids deleted via WS message_delete. A delayed REST snapshot must
	// not resurrect them.
	deletedMessageIds: Set<string>;
	// `${messageId}:${previewId}` tombstones from WS remove_preview. A delayed
	// REST snapshot / in-flight GET must not resurrect the preview.
	previewTombstones: Set<string>;

	// Pinned messages (from GET /channels/:id/pinned), ordered by pinned_at.
	// The source of truth for "is this message pinned".
	pinned: MessageWithAttachment[];
	pinnedLoaded: boolean;
	pinnedLoading: boolean;
	pinnedGeneration: number;
}

export interface MessagesState {
	channels: SvelteMap<string, ChannelMessagesState>;
}

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
	hasMoreOlder: boolean;
	// Keyset cursor for loading older messages.
	cursorOlder: KeysetCursor | null;
	// Pinned messages (from GET /channels/:id/pinned), ordered by pinned_at.
	// The source of truth for "is this message pinned".
	pinned: MessageWithAttachment[];
	pinnedLoaded: boolean;
	pinnedLoading: boolean;
}

export interface MessagesState {
	channels: SvelteMap<string, ChannelMessagesState>;
}

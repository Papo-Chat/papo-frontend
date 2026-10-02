// UI state — transient visual state for the chat shell.
// Drawer/popover open flags. Drawers only matter on mobile (the CSS shows
// the sidebar/members as always-visible columns on desktop regardless of these
// flags).
import type { UserSummary } from '../types';

export const state = $state({
	channelsDrawerOpen: false,
	railDrawerOpen: false,
	dmDirectoryOpen: false,
	membersDrawerOpen: false,
	voiceChatDrawerOpen: false,
	notificationsPopoverOpen: false,
	pinsPopoverOpen: false,
	profileOpen: false,
	profileUser: null as UserSummary | null,
	// Scroll/highlight target for "go to message" (search/notifications/pins
	// clicks). The channel page reads it once, loads the message into the
	// window if needed, scrolls + highlights, then clears it.
	scrollToMessageId: null as
		| { messageId: string; createdAt: string | null }
		| null
});

export function openProfile(user: UserSummary): void {
	state.profileUser = user;
	state.profileOpen = true;
}

export function closeProfile(): void {
	state.profileOpen = false;
	state.profileUser = null;
}

// Set a message the channel page should scroll to / highlight.
export function setScrollTarget(messageId: string, createdAt: string | null): void {
	state.scrollToMessageId = { messageId, createdAt };
}

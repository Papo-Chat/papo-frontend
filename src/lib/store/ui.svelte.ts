// UI state — transient visual state for the chat shell.
// Drawer/popover open flags. Drawers only matter on mobile (the CSS shows
// the sidebar/members as always-visible columns on desktop regardless of these
// flags).
import type { UserSummary } from '../types';

export const state = $state({
	channelsDrawerOpen: false,
	membersDrawerOpen: false,
	notificationsPopoverOpen: false,
	pinsPopoverOpen: false,
	profileOpen: false,
	profileUser: null as UserSummary | null,
	// Scroll/highlight target for "go to message" (search/notifications/pins
	// clicks). The channel page reads it once, scrolls + highlights, then
	// clears it.
	scrollToMessageId: null as string | null
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
export function setScrollTarget(messageId: string | null): void {
	state.scrollToMessageId = messageId;
}

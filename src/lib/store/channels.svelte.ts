// Channels store: channel summaries (byId + ordered), unread tracking, and
// grouped view.

import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api';
import { currentSessionEpoch, isCurrentSessionEpoch } from '../utils/session-epoch';
import { debounce } from '../utils/throttle';
import { evict as messagesEvict } from '../store/messages.svelte';
import { clearRoom as voiceClearRoom } from '../store/voice.svelte';
import { meId as sessionMeId } from '../store/session.svelte';
import type {
	Channel,
	ChannelPermissionEntry,
	ChannelType,
	ChannelUserSetting,
	NotificationSettings,
	WsMessage
} from '../types';

export const state = $state({
	byId: new SvelteMap<string, Channel>(),
	ordered: [] as string[],
	// Currently open channel (drives unread tracking + "is open" checks).
	openChannelId: null as string | null,
	// Unread tracking per channel. `has` is the boolean "there is unread"
	// (seeded from REST, F6); `count` is the live WS increment.
	unread: new SvelteMap<string, { has: boolean; count: number }>(),
	loaded: false,
	loading: false
});

// Debounced full reseed after channel_create (F4).
const reseedChannels = debounce(() => {
	load();
}, 300);

export function setOpen(channelId: string | null): void {
	state.openChannelId = channelId;
}

// Resolve a channel from a raw route param: exact id first, then name (so
// both /channels/:id and /channels/:name resolve). Returns null when nothing
// matches, so the caller decides where to redirect.
export function resolve(id: string | null | undefined): Channel | null {
	if (!id) {
		return null;
	}
	const byId = state.byId.get(id);
	if (byId) {
		return byId;
	}
	for (const cid of state.ordered) {
		const c = state.byId.get(cid);
		if (c && c.name === id) {
			return c;
		}
	}
	return null;
}

// The "home" channel used by the bootstrap when the URL points to the root:
// first text channel, falling back to the first channel of any type.
export function homeChannel(): Channel | null {
	for (const cid of state.ordered) {
		const c = state.byId.get(cid);
		if (c && c.type === 'text') {
			return c;
		}
	}
	for (const cid of state.ordered) {
		const c = state.byId.get(cid);
		if (c) {
			return c;
		}
	}
	return null;
}

// Awaitable full load (F2). Existing fire-and-forget callers are unaffected
// (the returned promise is simply ignored).
export async function load(): Promise<void> {
	state.loading = true;
	const epoch = currentSessionEpoch();
	try {
		const channels = await api.channels.list();
		if (!isCurrentSessionEpoch(epoch)) {
			return;
		}
		const byId = new SvelteMap<string, Channel>();
		const ordered: string[] = [];
		const unread = new SvelteMap<string, { has: boolean; count: number }>();
		for (const c of channels) {
			byId.set(c.id, c);
			ordered.push(c.id);
			const has =
				c.last_message && c.last_read_at
					? c.last_message.created_at > c.last_read_at
					: !!c.last_message;
			unread.set(c.id, { has, count: 0 });
		}
		state.byId = byId;
		state.ordered = ordered;
		state.unread = unread;
		state.loaded = true;
	} finally {
		state.loading = false;
	}
}

// Awaits the create so the reseed (channel list) happens after the channel
// exists, avoiding a reseed-before-create race on slow connections.
export async function create(req: {
	name: string;
	type: ChannelType;
	topic: string | null;
}): Promise<Channel> {
	const channel = await api.channels.create(req);
	reseedChannels.run();
	return channel;
}

export async function update(
	id: string,
	req: { name: string; topic: string | null }
): Promise<Channel> {
	const epoch = currentSessionEpoch();
	const channel = await api.channels.update(id, req);
	if (!isCurrentSessionEpoch(epoch)) {
		throw new Error('stale session');
	}
	state.byId.set(channel.id, channel);
	rebuildOrdered();
	return channel;
}

export async function changePosition(
	id: string,
	req: { old_position: number; new_position: number }
): Promise<Channel> {
	const epoch = currentSessionEpoch();
	const channel = await api.channels.changePosition(id, req);
	if (!isCurrentSessionEpoch(epoch)) {
		throw new Error('stale session');
	}
	// Positions of sibling channels may also shift server-side, so reseed the
	// ordered list after the mutation instead of patching only one row.
	await load();
	return state.byId.get(channel.id) ?? channel;
}

// Centralized local drop of a channel (REST delete + WS channel_delete both
// call this, so cleanup is identical).
export function dropChannelLocal(id: string): void {
	state.byId.delete(id);
	state.ordered = state.ordered.filter((cid) => cid !== id);
	state.unread.delete(id);
	// Evict dependent caches.
	messagesEvict(id);
	voiceClearRoom(id);
}

export async function remove(id: string): Promise<void> {
	const epoch = currentSessionEpoch();
	await api.channels.remove(id);
	if (!isCurrentSessionEpoch(epoch)) {
		throw new Error('stale session');
	}
	dropChannelLocal(id);
}

function rebuildOrdered(): void {
	const ids = state.ordered.filter((id) => state.byId.has(id));
	ids.sort((a, b) => {
		const ca = state.byId.get(a);
		const cb = state.byId.get(b);
		if (!ca || !cb) {
			return 0;
		}
		return ca.position - cb.position;
	});
	state.ordered = ids;
}

export function getPermissions(id: string): Promise<ChannelPermissionEntry[]> {
	return api.channels.permissions(id);
}

export async function setRolePermissions(
	id: string,
	roleId: string,
	perms: {
		read_channel: boolean;
		send_messages: boolean;
		delete_messages: boolean;
		connect_voice: boolean;
	}
): Promise<void> {
	await api.channels.setRolePermissions(id, roleId, { permissions: perms });
}

// F12 — self only: the store always passes the current user id.
export async function setChannelNotification(
	channelId: string,
	notification_settings: NotificationSettings
): Promise<ChannelUserSetting> {
	const userId = sessionMeId();
	if (!userId) {
		throw new Error('usuário não autenticado');
	}

	const setting = await api.channels.setChannelUserSetting(channelId, userId, {
		notification_settings
	});

	const channel = state.byId.get(channelId);
	if (channel) {
		state.byId.set(channelId, {
			...channel,
			notification_settings: setting.notification_settings
		});
	}

	return setting;
}

export async function setAllChannelNotifications(
	notification_settings: NotificationSettings
): Promise<void> {
	const ids = state.ordered.filter((id) => state.byId.get(id)?.type !== 'category');
	await Promise.all(ids.map((id) => setChannelNotification(id, notification_settings)));
}

export function setChannelUserSetting(
	notification_settings: NotificationSettings
): Promise<ChannelUserSetting> | null {
	const channelId = state.openChannelId;
	if (!channelId) {
		return null;
	}
	return setChannelNotification(channelId, notification_settings);
}

// Group channels by position; categories group the following channels.
export function grouped(): Array<{ category: Channel | null; channels: Channel[] }> {
	const ordered = state.ordered
		.map((id) => state.byId.get(id))
		.filter((c) => c != null) as Channel[];
	const result: Array<{ category: Channel | null; channels: Channel[] }> = [];
	let current: { category: Channel | null; channels: Channel[] } | null = null;
	for (const c of ordered) {
		if (c.type === 'category') {
			current = { category: c, channels: [] };
			result.push(current);
		} else {
			if (!current) {
				current = { category: null, channels: [] };
				result.push(current);
			}
			current.channels.push(c);
		}
	}
	return result;
}

// ── WS event handlers ───────────────────────────────────

// channel_create → debounced full reseed (F4).
export function handleChannelCreate(): void {
	reseedChannels.run();
}

// Patch only the fields that are present in the event (a channel_update may
// omit `topic`); never overwrite a field with an undefined default.
export function handleChannelUpdate(c: {
	channel_id: string;
	name?: string;
	position?: number;
	topic?: string | null;
}): void {
	const existing = state.byId.get(c.channel_id);
	if (!existing) {
		return;
	}
	const next: Channel = { ...existing };
	if (c.name != null) {
		next.name = c.name;
	}
	if (c.position != null) {
		next.position = c.position;
	}
	if (c.topic !== undefined) {
		next.topic = c.topic;
	}
	state.byId.set(c.channel_id, next);
	rebuildOrdered();
}

export function handleChannelDelete(channelId: string): void {
	dropChannelLocal(channelId);
}

// Full reset (logout / 401 / account switch).
export function reset(): void {
	state.byId.clear();
	state.ordered = [];
	state.openChannelId = null;
	state.unread.clear();
	state.loaded = false;
	state.loading = false;
}

// A new message arrived (dispatched by the websocket store). Updates the
// channel summary's last_message and bumps unread when the channel is not
// open and the author is not me (F6).
export function handleMessage(message: WsMessage): void {
	const channel = state.byId.get(message.channel_id);
	if (!channel) {
		return;
	}
	const next: Channel = { ...channel };
	next.last_message = {
		id: message.id,
		content: message.content,
		author_id: message.author_id,
		author_username: null,
		created_at: message.created_at
	};
	state.byId.set(channel.id, next);

	const isOpen = state.openChannelId === channel.id;
	if (!isOpen && message.author_id !== sessionMeId()) {
		const u = state.unread.get(channel.id) ?? { has: false, count: 0 };
		state.unread.set(channel.id, { has: true, count: u.count + 1 });
	}
}

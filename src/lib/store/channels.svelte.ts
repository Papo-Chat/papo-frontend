// Channels store: channel summaries (byId + ordered), unread tracking, and
// grouped view.

import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api';
import { debounce } from '../utils/throttle';
import { evict as messagesEvict } from '../store/messages.svelte';
import { clearRoom as voiceClearRoom } from '../store/voice.svelte';
import { meId as sessionMeId } from '../store/session.svelte';
import type {
	Channel,
	ChannelPermissionEntry,
	ChannelType,
	WsMessage,
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
	loading: false,
});

// Debounced full reseed after channel_create (F4).
const reseedChannels = debounce(() => {
	load();
}, 300);

export function setOpen(channelId: string | null): void {
	state.openChannelId = channelId;
}

export function load(): void {
	state.loading = true;
	api.channels
		.list()
		.then((channels) => {
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
		})
		.finally(() => {
			state.loading = false;
		});
}

export function create(req: { name: string; type: ChannelType; topic: string | null }): void {
	api.channels.create(req);
	reseedChannels.run();
}

export function update(id: string, req: { name: string; topic: string | null }): void {
	api.channels
		.update(id, req)
		.then((c) => {
			state.byId.set(c.id, c);
			rebuildOrdered();
		});
}

export function changePosition(
	id: string,
	req: { old_position: number; new_position: number }
): void {
	api.channels
		.changePosition(id, req)
		.then((c) => {
			state.byId.set(c.id, c);
			rebuildOrdered();
		});
}

export function remove(id: string): void {
	api.channels
		.remove(id)
		.then(() => {
			state.byId.delete(id);
			state.ordered = state.ordered.filter((cid) => cid !== id);
			state.unread.delete(id);
			// Evict dependent caches.
			messagesEvict(id);
			voiceClearRoom(id);
		});
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

export function setRolePermissions(
	id: string,
	roleId: string,
	perms: {
		read_channel: boolean;
		send_messages: boolean;
		delete_messages: boolean;
		connect_voice: boolean;
	}
): void {
	api.channels.setRolePermissions(id, roleId, { permissions: perms });
}

// F12 — self only: the store always passes the current user id.
export function setChannelUserSetting(
	notification_settings: 'off' | 'only_mentions' | 'all'
): void {
	const channelId = state.openChannelId;
	const userId = sessionMeId();
	if (!channelId || !userId) {
		return;
	}
	api.channels.setChannelUserSetting(channelId, userId, {
		notification_settings,
	});
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

export function handleChannelUpdate(c: {
	channel_id: string;
	name: string;
	position: number;
	topic: string | null;
}): void {
	const existing = state.byId.get(c.channel_id);
	if (existing) {
		const next: Channel = { ...existing };
		next.name = c.name;
		next.position = c.position;
		next.topic = c.topic;
		state.byId.set(c.channel_id, next);
		rebuildOrdered();
	}
}

export function handleChannelDelete(channelId: string): void {
	state.byId.delete(channelId);
	state.ordered = state.ordered.filter((id) => id !== channelId);
	state.unread.delete(channelId);
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
		created_at: message.created_at,
	};
	state.byId.set(channel.id, next);

	const isOpen = state.openChannelId === channel.id;
	if (!isOpen && message.author_id !== sessionMeId()) {
		const u = state.unread.get(channel.id) ?? { has: false, count: 0 };
		state.unread.set(channel.id, { has: true, count: u.count + 1 });
	}
}

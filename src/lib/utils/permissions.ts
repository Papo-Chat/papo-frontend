// Channel- and role-level permission helpers (pure, testable).
//
// Mirrors the backend authorization semantics (middleware/permissions.go +
// services/channels.go):
//   - The server owner implicitly has ALL permissions.
//   - A channel with no permission entries is "open": everyone can read,
//     send and join voice. Delete is NOT free even in open channels — it
//     still needs an explicit role permission (author can always delete their
//     own message). (matches "canais abertos sem permissões definidas").
//   - Non-owner access is the union of the user's roles.

import type { Channel, Role, RolePermissions } from '../types/models';

export interface RoleContext {
	roles: Role[];
	isOwner: boolean;
}

// Union of the user's role permissions. The server owner implicitly has every
// permission true.
export function myRolePermissions(roles: Role[], isOwner: boolean): RolePermissions {
	if (isOwner) {
		return {
			manage_server: true,
			manage_channels: true,
			manage_roles: true,
			ban_members: true,
			pin_message: true,
			everyone_message: true,
			send_attachment: true
		};
	}
	return roles.reduce<RolePermissions>(
		(acc, role) => {
			acc.manage_server = acc.manage_server || role.permissions.manage_server;
			acc.manage_channels = acc.manage_channels || role.permissions.manage_channels;
			acc.manage_roles = acc.manage_roles || role.permissions.manage_roles;
			acc.ban_members = acc.ban_members || role.permissions.ban_members;
			acc.pin_message = acc.pin_message || role.permissions.pin_message;
			acc.everyone_message = acc.everyone_message || role.permissions.everyone_message;
			acc.send_attachment = acc.send_attachment || role.permissions.send_attachment;
			return acc;
		},
		{
			manage_server: false,
			manage_channels: false,
			manage_roles: false,
			ban_members: false,
			pin_message: false,
			everyone_message: false,
			send_attachment: false
		}
	);
}

export interface ChannelAccess {
	read: boolean;
	send: boolean;
	del: boolean;
	voice: boolean;
}

// Channel-level access for the user. The owner bypasses everything; an
// "open" channel (empty permissions array) grants everything; otherwise the
// access is the union of every channel permission entry whose role the user
// holds.
export function channelAccess(channel: Channel, ctx: RoleContext): ChannelAccess {
	if (ctx.isOwner) {
		return { read: true, send: true, del: true, voice: true };
	}
	// Open channel: no permission entries → everyone can read, send and join
	// voice. Delete is NOT free: it requires an explicit role permission
	// (the author check lives in Message.svelte, per the backend rule that
	// author OR delete_messages is required).
	if (channel.permissions.length === 0) {
		return { read: true, send: true, del: false, voice: true };
	}
	const userRoleIds = new Set(ctx.roles.map((r) => r.id));
	const access: ChannelAccess = {
		read: false,
		send: false,
		del: false,
		voice: false
	};
	for (const entry of channel.permissions) {
		if (!userRoleIds.has(entry.role_id)) {
			continue;
		}
		access.read = access.read || entry.permissions.read_channel;
		access.send = access.send || entry.permissions.send_messages;
		access.del = access.del || entry.permissions.delete_messages;
		access.voice = access.voice || entry.permissions.connect_voice;
	}
	return access;
}

// Convenience: does the current user (via their role context) hold a given
// role-level permission?
export function can(perm: keyof RolePermissions, ctx: RoleContext): boolean {
	return myRolePermissions(ctx.roles, ctx.isOwner)[perm];
}


export function hasAnyChannelPermission(perms: {
	read_channel: boolean;
	send_messages: boolean;
	delete_messages: boolean;
	connect_voice: boolean;
}): boolean {
	return Object.values(perms).some(Boolean);
}

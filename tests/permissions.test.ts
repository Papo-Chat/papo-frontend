// Vitest on core logic: channel/role permission helpers (pure, testable).

import { describe, it, expect } from 'vitest';
import { myRolePermissions, channelAccess, can } from '../src/lib/utils/permissions';
import type {
	Channel,
	ChannelPermissionEntry,
	Role,
	RolePermissions
} from '../src/lib/types/models';

// ── fixtures ─────────────────────────────────────────────

function allFalse(): RolePermissions {
	return {
		manage_server: false,
		manage_channels: false,
		manage_roles: false,
		ban_members: false,
		pin_message: false,
		everyone_message: false,
		send_attachment: false
	};
}

function makeRole(id: string, perms: Partial<RolePermissions>): Role {
	return {
		id,
		name: id,
		color: null,
		permissions: { ...allFalse(), ...perms },
		created_at: '2024-01-01T00:00:00Z'
	};
}

function makeChannel(permissions: ChannelPermissionEntry[] = []): Channel {
	return {
		id: 'ch1',
		name: 'general',
		type: 'text',
		position: 0,
		permissions,
		created_at: '2024-01-01T00:00:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'all'
	};
}

// ── myRolePermissions ────────────────────────────────────

describe('myRolePermissions', () => {
	it('owner implicitly has every permission', () => {
		expect(myRolePermissions([], true)).toEqual({
			manage_server: true,
			manage_channels: true,
			manage_roles: true,
			ban_members: true,
			pin_message: true,
			everyone_message: true,
			send_attachment: true
		});
	});

	it('non-owner with no roles has every permission false', () => {
		expect(myRolePermissions([], false)).toEqual(allFalse());
	});

	it('is the union of the user role permissions', () => {
		const perms = myRolePermissions(
			[
				makeRole('r1', { manage_channels: true, pin_message: true }),
				makeRole('r2', { manage_server: true, everyone_message: true })
			],
			false
		);
		expect(perms).toEqual({
			manage_server: true,
			manage_channels: true,
			manage_roles: false,
			ban_members: false,
			pin_message: true,
			everyone_message: true,
			send_attachment: false
		});
	});
});

// ── channelAccess ────────────────────────────────────────

describe('channelAccess', () => {
	it('owner bypasses everything (even a closed channel)', () => {
		const ch = makeChannel([
			{
				role_id: 'r9',
				role_name: 'r9',
				permissions: {
					read_channel: false,
					send_messages: false,
					delete_messages: false,
					connect_voice: false
				}
			}
		]);
		expect(channelAccess(ch, { roles: [], isOwner: true })).toEqual({
			read: true,
			send: true,
			del: true,
			voice: true
		});
	});

	it('open channel (empty permissions) grants everything to anyone', () => {
		const ch = makeChannel([]);
		expect(channelAccess(ch, { roles: [], isOwner: false })).toEqual({
			read: true,
			send: true,
			del: true,
			voice: true
		});
	});

	it('non-owner gets the union of entries for roles they hold', () => {
		const ch = makeChannel([
			{
				role_id: 'r1',
				role_name: 'r1',
				permissions: {
					read_channel: true,
					send_messages: false,
					delete_messages: false,
					connect_voice: true
				}
			},
			{
				role_id: 'r2',
				role_name: 'r2',
				permissions: {
					read_channel: false,
					send_messages: true,
					delete_messages: true,
					connect_voice: false
				}
			}
		]);
		const access = channelAccess(ch, {
			roles: [makeRole('r1', {}), makeRole('r2', {})],
			isOwner: false
		});
		expect(access).toEqual({ read: true, send: true, del: true, voice: true });
	});

	it('ignores entries for roles the user does not hold', () => {
		const ch = makeChannel([
			{
				role_id: 'r9',
				role_name: 'r9',
				permissions: {
					read_channel: true,
					send_messages: true,
					delete_messages: true,
					connect_voice: true
				}
			}
		]);
		const access = channelAccess(ch, {
			roles: [makeRole('r1', {})],
			isOwner: false
		});
		expect(access).toEqual({ read: false, send: false, del: false, voice: false });
	});
});

// ── can ──────────────────────────────────────────────────

describe('can', () => {
	it('reflects role-level permissions (owner true, non-owner false)', () => {
		expect(can('ban_members', { roles: [], isOwner: true })).toBe(true);
		expect(can('ban_members', { roles: [], isOwner: false })).toBe(false);
	});

	it('reflects a permission granted by a role', () => {
		const ctx = {
			roles: [makeRole('r1', { ban_members: true })],
			isOwner: false
		};
		expect(can('ban_members', ctx)).toBe(true);
	});
});

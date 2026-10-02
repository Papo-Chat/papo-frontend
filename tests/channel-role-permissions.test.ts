import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api';
import * as channelsStore from '../src/lib/store/channels.svelte';
import type { Channel } from '../src/lib/types';

function channel(): Channel {
	return {
		id: 'ch1',
		name: 'general',
		type: 'text',
		position: 0,
		permissions: [
			{
				role_id: 'r1',
				role_name: 'Role 1',
				permissions: {
					read_channel: true,
					send_messages: false,
					delete_messages: false,
					connect_voice: false
				}
			},
			{
				role_id: 'r2',
				role_name: 'Role 2',
				permissions: {
					read_channel: true,
					send_messages: true,
					delete_messages: false,
					connect_voice: false
				}
			}
		],
		created_at: '2026-10-02T00:00:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'all'
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	channelsStore.state.byId.clear();
	channelsStore.state.ordered = [];
});

describe('removeRolePermissions', () => {
	it('calls the delete API and removes only that role from the cached channel relation', async () => {
		const remove = vi.spyOn(api.channels, 'removeRolePermissions').mockResolvedValue(undefined);
		channelsStore.state.byId.set('ch1', channel());

		await channelsStore.removeRolePermissions('ch1', 'r1');

		expect(remove).toHaveBeenCalledWith('ch1', 'r1');
		expect(channelsStore.state.byId.get('ch1')?.permissions.map((entry) => entry.role_id)).toEqual(['r2']);
	});
});

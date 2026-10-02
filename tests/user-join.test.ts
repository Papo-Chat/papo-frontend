import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api';
import * as usersStore from '../src/lib/store/users.svelte';
import type { UserProfile, UserSummary } from '../src/lib/types';

function summary(id: string): UserSummary {
	return {
		id,
		username: `user-${id}`,
		nickname: null,
		banned: false,
		status: null,
		status_message: null,
		typing: null,
		status_updated_at: null,
		created_at: '2026-10-02T00:00:00Z',
		roles: []
	};
}

function profile(id: string): UserProfile {
	return {
		...summary(id),
		avatar_blob: null,
		avatar_format: 'PNG',
		banner_media: null,
		description: 'novo usuário'
	};
}

beforeEach(() => {
	usersStore.reset();
	usersStore.state.list.loaded = true;
	usersStore.state.list.hasMoreNext = false;
});

afterEach(() => {
	vi.restoreAllMocks();
	usersStore.reset();
});

describe('user_join store integration', () => {
	it('loads summary and profile and appends a newly joined user to the visible final window', async () => {
		const joinedSummary = summary('u-new');
		const joinedProfile = profile('u-new');
		const summarySpy = vi.spyOn(api.users, 'summaryBatch').mockResolvedValue([joinedSummary]);
		const profileSpy = vi.spyOn(api.users, 'profile').mockResolvedValue(joinedProfile);

		usersStore.handleUserJoin('u-new');

		await vi.waitFor(() => {
			expect(usersStore.state.profiles.get('u-new')).toEqual(joinedProfile);
			expect(usersStore.state.byId.get('u-new')?.username).toBe('user-u-new');
			expect(usersStore.state.list.items.some((user) => user.id === 'u-new')).toBe(true);
		});

		expect(summarySpy).toHaveBeenCalledWith(['u-new']);
		expect(profileSpy).toHaveBeenCalledWith('u-new');
		expect(usersStore.state.joinNotice?.userId).toBe('u-new');
	});

	it('does not append into a paginated window that is not at the end', async () => {
		usersStore.state.list.hasMoreNext = true;
		vi.spyOn(api.users, 'summaryBatch').mockResolvedValue([summary('u-new')]);
		vi.spyOn(api.users, 'profile').mockResolvedValue(profile('u-new'));

		usersStore.handleUserJoin('u-new');

		await vi.waitFor(() => {
			expect(usersStore.state.profiles.has('u-new')).toBe(true);
			expect(usersStore.state.byId.has('u-new')).toBe(true);
		});

		expect(usersStore.state.list.items.some((user) => user.id === 'u-new')).toBe(false);
	});
});

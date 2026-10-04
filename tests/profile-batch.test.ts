import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api';
import * as usersStore from '../src/lib/store/users.svelte';
import type { UserProfile } from '../src/lib/types';

function profile(id: string): UserProfile {
	return {
		id,
		username: `user-${id}`,
		nickname: null,
		banned: false,
		status: null,
		status_message: null,
		typing: null,
		status_updated_at: null,
		created_at: '2026-10-03T00:00:00Z',
		roles: [],
		avatar_blob: null,
		avatar_format: 'PNG',
		banner_media: null,
		description: null
	};
}

beforeEach(() => {
	usersStore.reset();
	vi.useFakeTimers();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	usersStore.reset();
});

describe('profile batch coalescing', () => {
	it('groups profile ids requested across nearby tasks into one profile_batch call', async () => {
		const batchSpy = vi.spyOn(api.users, 'profileBatch').mockImplementation(async (ids) => ({
			profiles: ids.map(profile)
		}));

		const first = usersStore.ensureProfile('u1');
		await Promise.resolve();
		const second = usersStore.ensureProfiles(['u2', 'u3']);

		expect(batchSpy).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(20);
		await expect(first).resolves.toEqual(profile('u1'));
		await expect(second).resolves.toEqual([profile('u2'), profile('u3')]);

		expect(batchSpy).toHaveBeenCalledTimes(1);
		expect(batchSpy).toHaveBeenCalledWith(['u1', 'u2', 'u3']);
	});

	it('deduplicates repeated ids before dispatch', async () => {
		const batchSpy = vi.spyOn(api.users, 'profileBatch').mockImplementation(async (ids) => ({
			profiles: ids.map(profile)
		}));

		const first = usersStore.ensureProfile('same');
		const second = usersStore.ensureProfile('same');
		const third = usersStore.ensureProfiles(['same', 'other', 'other']);

		await vi.advanceTimersByTimeAsync(20);
		await Promise.all([first, second, third]);

		expect(batchSpy).toHaveBeenCalledTimes(1);
		expect(batchSpy).toHaveBeenCalledWith(['same', 'other']);
	});

	it('splits only when the backend 50-id limit is exceeded', async () => {
		const batchSpy = vi.spyOn(api.users, 'profileBatch').mockImplementation(async (ids) => ({
			profiles: ids.map(profile)
		}));
		const ids = Array.from({ length: 51 }, (_, i) => `u${i}`);

		const request = usersStore.ensureProfiles(ids);
		await vi.advanceTimersByTimeAsync(20);
		await request;

		expect(batchSpy).toHaveBeenCalledTimes(2);
		expect(batchSpy.mock.calls[0][0]).toHaveLength(50);
		expect(batchSpy.mock.calls[1][0]).toEqual(['u50']);
	});
});

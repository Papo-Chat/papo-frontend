import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api';
import * as usersStore from '../src/lib/store/users.svelte';

beforeEach(() => {
	usersStore.reset();
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-10-03T19:00:00Z'));
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	usersStore.reset();
});

describe('users list retry protection', () => {
	it('suppresses immediate reactive retries after a failed /users request', async () => {
		const listSpy = vi
			.spyOn(api.users, 'list')
			.mockRejectedValueOnce(new Error('rate limited'))
			.mockResolvedValue({ users: [], has_more: false });

		await expect(usersStore.loadList()).rejects.toThrow('rate limited');
		expect(listSpy).toHaveBeenCalledTimes(1);
		expect(usersStore.state.list.loaded).toBe(false);
		expect(usersStore.state.list.loading).toBe(false);

		// This mirrors the Svelte effect re-running when loading flips back to
		// false. The failed request must not immediately hit /users again.
		await usersStore.loadList();
		expect(listSpy).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(5_001);
		await usersStore.loadList();

		expect(listSpy).toHaveBeenCalledTimes(2);
		expect(usersStore.state.list.loaded).toBe(true);
	});
});

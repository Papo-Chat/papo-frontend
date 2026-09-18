// Vitest on core logic: typing indicator TTL expiry + self-cleaning.
//
// The typing state is `channelId -> userId -> expiresAt (ms epoch)`. Entries
// are pruned when `expiresAt <= now`. The store exposes setTyping / isTyping /
// typingUsers / pruneTyping.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { state, setTyping, isTyping, typingUsers, pruneTyping } from '../src/lib/store/users.svelte';

// Fixed clock so TTL tests are deterministic.
let now = 0;
const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);

beforeEach(() => {
	now = 0;
	state.typing.clear();
});

// The spy stays active for the whole file (not restored per-test); `now` is
// reset in beforeEach so each test is deterministic.

describe('setTyping / isTyping / typingUsers', () => {
	it('a user is typing immediately after setTyping(true)', () => {
		now = 1000;
		setTyping('ch1', 'u1', true);
		expect(isTyping('ch1', 'u1')).toBe(true);
		expect(typingUsers('ch1')).toEqual(['u1']);
	});

	it('setTyping(false) removes the user', () => {
		now = 1000;
		setTyping('ch1', 'u1', true);
		setTyping('ch1', 'u1', false);
		expect(isTyping('ch1', 'u1')).toBe(false);
	});

	it('typing is per-channel (not shared across channels)', () => {
		now = 1000;
		setTyping('ch1', 'u1', true);
		setTyping('ch2', 'u1', true);
		expect(isTyping('ch1', 'u1')).toBe(true);
		expect(isTyping('ch2', 'u1')).toBe(true);
		// clearing one channel does not affect the other
		setTyping('ch1', 'u1', false);
		expect(isTyping('ch1', 'u1')).toBe(false);
		expect(isTyping('ch2', 'u1')).toBe(true);
	});

	it('multiple users can be typing in the same channel', () => {
		now = 1000;
		setTyping('ch1', 'u1', true);
		setTyping('ch1', 'u2', true);
		expect(typingUsers('ch1')).toEqual(['u1', 'u2']);
	});

	it('returns empty for a channel with no typing', () => {
		expect(typingUsers('ch1')).toEqual([]);
	});
});

describe('TTL expiry + self-cleaning', () => {
	it('a typing entry expires after the TTL (5s)', () => {
		now = 1000;
		setTyping('ch1', 'u1', true);
		// just under TTL: still typing
		now = 1000 + 4999;
		expect(isTyping('ch1', 'u1')).toBe(true);
		// at/after TTL: expired (expiresAt = 6000; expiresAt <= now)
		now = 1000 + 5000;
		expect(isTyping('ch1', 'u1')).toBe(false);
		expect(typingUsers('ch1')).toEqual([]);
	});

	it('pruneTyping removes only expired entries and keeps fresh ones', () => {
		now = 1000;
		setTyping('ch1', 'u1', true); // expires at 6000
		setTyping('ch1', 'u2', true);
		// advance so u1 is expired but u2 is not (set u2 later)
		now = 1000 + 4000;
		setTyping('ch1', 'u2', true); // expires at 9000
		now = 1000 + 6000; // u1 expired (6000), u2 fresh (9000)
		pruneTyping();
		expect(isTyping('ch1', 'u1')).toBe(false);
		expect(isTyping('ch1', 'u2')).toBe(true);
	});

	it('pruneTyping clears the whole channel entry when everything expired', () => {
		now = 1000;
		setTyping('ch1', 'u1', true);
		now = 1000 + 6000;
		pruneTyping();
		// inner map is now empty
		const map = state.typing.get('ch1');
		expect(map ? map.size : 0).toBe(0);
	});
});

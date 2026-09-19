// Vitest on core logic: keyset pagination helpers (F5, F17).

import { describe, it, expect } from 'vitest';
import { nextCursor, toQuery, groupKey, mergeGroups } from '../src/lib/utils/keyset';

describe('nextCursor', () => {
	// nextCursor expects a DESC list (newest first, as returned by the API) and
	// reads the last item as the oldest.
	it('returns the (created_at, id) of the oldest item (last in a DESC list)', () => {
		const msgs = [
			{ id: 'c', created_at: '2024-01-01T00:00:02Z' },
			{ id: 'b', created_at: '2024-01-01T00:00:01Z' },
			{ id: 'a', created_at: '2024-01-01T00:00:00Z' }
		];
		expect(nextCursor(msgs)).toEqual({
			since: '2024-01-01T00:00:00Z',
			last_id: 'a'
		});
	});

	it('uses id as tie-breaker when created_at is equal (DESC list)', () => {
		// Same created_at: larger id is "newer" → appears earlier in DESC order.
		const msgs = [
			{ id: 'b', created_at: '2024-01-01T00:00:00Z' },
			{ id: 'a', created_at: '2024-01-01T00:00:00Z' }
		];
		// oldest = last = smaller id ('a')
		expect(nextCursor(msgs)?.last_id).toBe('a');
	});

	it('returns null for an empty list', () => {
		expect(nextCursor([])).toBeNull();
	});
});

describe('toQuery', () => {
	it('serializes since + last_id as a query string', () => {
		const cursor = { since: '2024-01-01T00:00:02Z', last_id: 'c' };
		expect(toQuery(cursor)).toBe('since=2024-01-01T00%3A00%3A02Z&last_id=c');
	});

	it('returns null for a null/empty cursor', () => {
		expect(toQuery(null)).toBeNull();
	});
});

describe('groupKey', () => {
	it('distinguishes different (emoji_id, unicode) pairs', () => {
		expect(groupKey('e1', null)).not.toBe(groupKey('e1', 'x'));
	});

	it('is stable for the same pair', () => {
		expect(groupKey('e1', null)).toBe(groupKey('e1', null));
	});
});

describe('mergeGroups', () => {
	it('sums counts and concatenates users for the same (emoji_id, unicode) across pages', () => {
		const groups = [
			{
				emoji_id: 'e1',
				unicode: null,
				count: 2,
				users: [{ id: 'r1', user_id: 'u1', created_at: 'a' }]
			},
			{
				emoji_id: 'e1',
				unicode: null,
				count: 3,
				users: [{ id: 'r2', user_id: 'u2', created_at: 'b' }]
			},
			{
				emoji_id: 'e2',
				unicode: null,
				count: 1,
				users: []
			}
		];
		const merged = mergeGroups(groups);
		expect(merged).toHaveLength(2);
		// order preserved by first appearance
		expect(merged[0].emoji_id).toBe('e1');
		expect(merged[0].count).toBe(5);
		expect(merged[0].users).toHaveLength(2);
		expect(merged[0].users[0].user_id).toBe('u1');
		expect(merged[0].users[1].user_id).toBe('u2');
		expect(merged[1].emoji_id).toBe('e2');
		expect(merged[1].count).toBe(1);
	});

	it('keeps distinct emoji groups separate', () => {
		const groups = [
			{ emoji_id: 'e1', unicode: null, count: 1, users: [] },
			{ emoji_id: 'e2', unicode: null, count: 1, users: [] }
		];
		expect(mergeGroups(groups)).toHaveLength(2);
	});

	it('treats (emoji_id, unicode) as distinct from (emoji_id, other_unicode)', () => {
		const groups = [
			{ emoji_id: 'e1', unicode: null, count: 1, users: [] },
			{ emoji_id: 'e1', unicode: 'x', count: 1, users: [] }
		];
		expect(mergeGroups(groups)).toHaveLength(2);
	});

	it('returns an empty array for no groups', () => {
		expect(mergeGroups([])).toHaveLength(0);
	});
});

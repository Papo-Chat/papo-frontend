// Keyset pagination helpers (F5).
//
// The backend paginates list endpoints with a DESC keyset on (created_at, id):
//   - no params       → latest 100 (or page size)
//   - since+last_id   → strictly older than the cursor
//   - since only      → strictly newer (created_at > since)
//
// The cursor is the (created_at, id) of the OLDEST item on the page (the
// last item of a DESC list). `nextCursor` reads it off the last item.

export interface KeysetCursor {
	// ISO 8601 timestamp of the oldest item on the page.
	since: string;
	// id of the oldest item on the page; combined with `since` as the exact
	// (created_at, id) cursor.
	last_id: string;
}

export interface KeysetPage<T> {
	items: T[];
	has_more: boolean;
}

// `cursor` is the (created_at, id) of the oldest item on the page.
// Returns null when the page is empty.
export function nextCursor<T extends { created_at: string; id: string }>(
	items: T[]
): KeysetCursor | null {
	if (items.length === 0) {
		return null;
	}
	const oldest = items[items.length - 1];
	return {
		since: oldest.created_at,
		last_id: oldest.id
	};
}

// Serializes a cursor into the query string the backend expects:
//   since=<iso>&last_id=<id>
// Returns null when there is no cursor.
export function toQuery(cursor: KeysetCursor | null): string | null {
	if (!cursor) {
		return null;
	}
	return `since=${encodeURIComponent(cursor.since)}&last_id=${encodeURIComponent(cursor.last_id)}`;
}

// Merges reaction groups across keyset pages (F17). Groups are identified
// by the (emoji_id, unicode) key. When the same key appears on multiple
// pages, the counts are summed and the user lists concatenated.
export interface ReactionGroupKey {
	emoji_id: string | null;
	unicode: string | null;
}

export function groupKey(emoji_id: string | null, unicode: string | null): string {
	return `${String(emoji_id)}|${String(unicode)}`;
}

export function mergeGroups(
	groups: Array<{
		emoji_id: string | null;
		unicode: string | null;
		count: number;
		users: { id: string; user_id: string; created_at: string }[];
	}>
): {
	emoji_id: string | null;
	unicode: string | null;
	count: number;
	users: { id: string; user_id: string; created_at: string }[];
}[] {
	const merged: Map<
		string,
		{
			emoji_id: string | null;
			unicode: string | null;
			count: number;
			users: { id: string; user_id: string; created_at: string }[];
		}
	> = new Map();

	for (const g of groups) {
		const key = groupKey(g.emoji_id, g.unicode);
		const existing = merged.get(key);
		if (!existing) {
			merged.set(key, {
				emoji_id: g.emoji_id,
				unicode: g.unicode,
				count: g.count,
				users: [...g.users]
			});
		} else {
			existing.count += g.count;
			existing.users = [...existing.users, ...g.users];
		}
	}

	return Array.from(merged.values());
}

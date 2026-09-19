// Date helpers. The backend always sends ISO 8601 (RFC 3339); this module
// centralizes parsing/formatting and relative-time display.

// Parse a backend ISO 8601 timestamp into a Date, or null on failure.
export function parseISO(value: string | null | undefined): Date | null {
	if (!value) {
		return null;
	}
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}

// Format a Date as a readable "day, month, year" label (locale-aware).
export function formatDate(d: Date, opts?: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		...(opts ?? {})
	}).format(d);
}

// Format a Date as a full timestamp "day, month, year, HH:mm" (locale-aware).
export function formatTimestamp(d: Date, opts?: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		...(opts ?? {})
	}).format(d);
}

// Relative time like "2m ago", "3h ago", "yesterday", "yesterday at 14:30".
// Returns '' when the date is too far in the past to be useful (older than
// ~7 days) so the caller can fall back to an absolute date.
export function formatRelative(d: Date, now: Date = new Date()): string {
	const nowTime = now.getTime();
	const diff = nowTime - d.getTime();
	const msPerMinute = 60_000;
	const msPerHour = 3_600_000;
	const msPerDay = 86_400_000;

	if (diff < 0) {
		return formatTimestamp(d);
	}
	if (diff < 10_000) {
		return 'just now';
	}
	if (diff < msPerMinute) {
		return `${Math.floor(diff / 1000)}s ago`;
	}
	if (diff < msPerHour) {
		return `${Math.floor(diff / msPerMinute)}m ago`;
	}
	if (diff < msPerDay) {
		return `${Math.floor(diff / msPerHour)}h ago`;
	}
	const days = Math.floor(diff / msPerDay);
	if (days === 1) {
		return 'yesterday';
	}
	if (days <= 7) {
		return `${days}d ago`;
	}
	// Older than a week: fall back to an absolute date.
	return formatTimestamp(d);
}

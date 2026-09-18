// Text helpers: mention parsing, truncation, byte formatting and image mime
// detection.

// A user mention is `@<uuid>`; `@everyone` is a special mention to all
// members of the server.
export const everyoneMention = '@everyone';

// True when the text contains the `@everyone` mention.
export function hasEveryone(text: string): boolean {
	return /\b@everyone\b/i.test(text);
}

// Extract all user mentions (`@<uuid>`) from a message, deduplicated and in
// order of first appearance. Ignores `@everyone`.
export function extractMentions(text: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const m of text.match(/@[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi) ?? []) {
		const id = m.slice(1);
		if (!seen.has(id)) {
			seen.add(id);
			out.push(id);
		}
	}
	return out;
}

// Truncate a string to at most `max` characters, adding an ellipsis when
// something was cut.
export function truncate(text: string, max: number, suffix = '…'): string {
	if (text.length <= max) {
		return text;
	}
	return text.slice(0, max) + suffix;
}

// Human-readable byte size ("1.2 MB").
export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	const units = ['KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log2(bytes) / 10);
	const value = bytes / 1024 ** (i + 1);
	return `${value.toFixed(1)} ${units[i]}`;
}

// True when the mime type is an image the UI can render inline.
export function isImageMime(mime: string): boolean {
	return /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i.test(mime);
}

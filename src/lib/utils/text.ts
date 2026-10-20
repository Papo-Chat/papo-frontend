// Text helpers: mention parsing, truncation, byte formatting and image mime
// detection.

// A user mention is `@<uuid>`; `@everyone` is a special mention to all
// members of the server.
export const everyoneMention = '@everyone';

// True when the MIME identifies a video container, including the container
// types returned by the backend (MP4, QuickTime, WebM, Matroska, AVI, 3GPP/3GPP2).
export function isVideoMime(mime: string): boolean {
	return /^video\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(mime.trim());
}

// True when the text contains the @everyone mention.
export function hasEveryone(text: string): boolean {
	return /\b@everyone\b/i.test(text);
}

// Extract all user mentions (`@<uuid>`) from a message, deduplicated and in
// order of first appearance. Ignores `@everyone`.
export function extractMentions(text: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const m of text.match(/@[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi) ??
		[]) {
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
	const i = Math.floor(Math.log(bytes) / Math.log(1024)) - 1;
	const value = bytes / 1024 ** (i + 1);

	return `${value.toFixed(1)} ${units[i]}`;
}

// True when the mime type is an image the UI can render inline.
export function isImageMime(mime: string): { isImage: boolean; isGif: boolean } {
	const normalized = mime.trim().toLowerCase();
	// Backend also identifies HEIC/HEIF (image/heic); inline rendering still
	// relies on an available thumbnail when the browser cannot decode the original.
	const isImage = /^image\/(png|jpe?g|gif|webp|bmp|avif|heic)$/i.test(normalized);
	const isGif = normalized === 'image/gif';
	return { isImage, isGif };
}

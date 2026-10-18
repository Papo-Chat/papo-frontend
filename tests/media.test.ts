// Vitest on media helpers: format↔MIME mapping (P0.8) and the inline media
// box reservation. These are pure and node-testable.

import { describe, it, expect } from 'vitest';
import {
	formatToMime,
	mimeToFormat,
	attachmentMediaBox,
	embedMediaBox
} from '../src/lib/utils/media';
import type { MessageAttachment } from '../src/lib/types/models';

describe('formatToMime', () => {
	it('maps backend formats to the correct MIME', () => {
		expect(formatToMime('PNG')).toBe('image/png');
		expect(formatToMime('JPEG')).toBe('image/jpeg');
		expect(formatToMime('JPG')).toBe('image/jpeg');
		expect(formatToMime('WEBP')).toBe('image/webp');
		expect(formatToMime('GIF')).toBe('image/gif');
	});

	it('falls through to the input for an unknown format', () => {
		expect(formatToMime('UNKNOWN')).toBe('UNKNOWN');
	});
});

describe('mimeToFormat', () => {
	it('maps MIME back to the backend format', () => {
		expect(mimeToFormat('image/png')).toBe('PNG');
		expect(mimeToFormat('image/jpeg')).toBe('JPEG');
		expect(mimeToFormat('image/webp')).toBe('WEBP');
		expect(mimeToFormat('image/gif')).toBe('GIF');
	});

	it('falls through to the input for an unknown MIME', () => {
		expect(mimeToFormat('image/tiff')).toBe('image/tiff');
	});
});

function attachment(overrides: Partial<MessageAttachment> = {}): MessageAttachment {
	return {
		id: 'a1',
		mime_type: 'image/png',
		original_file_name: 'x.png',
		size_bytes: 100,
		thumbnail_id: 't1',
		thumbnail_width: 512,
		thumbnail_height: 384,
		created_at: '2024-01-01T00:00:00Z',
		moderation_status: 'clean',
		...overrides
	};
}

describe('attachmentMediaBox', () => {
	it('reserves the box from the thumbnail geometry (the inline bitmap)', () => {
		expect(attachmentMediaBox(attachment())).toEqual({ width: 512, height: 384 });
	});

	it('does not reserve without thumbnail geometry from the API', () => {
		expect(attachmentMediaBox(attachment({ thumbnail_width: null }))).toBeNull();
		expect(attachmentMediaBox(attachment({ thumbnail_height: null }))).toBeNull();
	});

	it('does not reserve on non-positive geometry', () => {
		expect(attachmentMediaBox(attachment({ thumbnail_width: 0 }))).toBeNull();
		expect(attachmentMediaBox(attachment({ thumbnail_height: -1 }))).toBeNull();
	});

	it('does not reserve without a thumbnail', () => {
		expect(attachmentMediaBox(attachment({ thumbnail_id: null }))).toBeNull();
	});

	it('does not reserve for GIF (the inline bitmap is the original)', () => {
		expect(attachmentMediaBox(attachment({ mime_type: 'image/gif' }))).toBeNull();
	});
});

describe('embedMediaBox', () => {
	it('reads the geometry declared in the embed summary', () => {
		expect(embedMediaBox({ url: 'https://x/i.png', width: 1280, height: 720 })).toEqual({
			width: 1280,
			height: 720
		});
	});

	it('returns null when there is no usable geometry', () => {
		expect(embedMediaBox(null)).toBeNull();
		expect(embedMediaBox(undefined)).toBeNull();
		expect(embedMediaBox({ url: 'https://x/i.png' })).toBeNull();
		expect(embedMediaBox({ width: 0, height: 720 })).toBeNull();
		expect(embedMediaBox({ width: 1280, height: null })).toBeNull();
	});
});

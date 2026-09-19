// Vitest on media helpers: format↔MIME mapping (P0.8).
// These are pure and node-testable.

import { describe, it, expect } from 'vitest';
import { formatToMime, mimeToFormat } from '../src/lib/utils/media';

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
		expect(mimeToFormat('image/avif')).toBe('image/avif');
	});
});

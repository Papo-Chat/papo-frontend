// Vitest on embed display helpers (utils/embeds.ts): iframe allowlist, color
// guard, host label and the https requirement of the video relay.

import { describe, it, expect } from 'vitest';
import { embedHost, isAllowedEmbedUrl, isHttpsUrl, safeEmbedColor } from '../src/lib/utils/embeds';

describe('isAllowedEmbedUrl', () => {
	it('accepts only the backend hardcoded YouTube embed pattern', () => {
		expect(isAllowedEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(true);
	});

	it('rejects anything else (never render an iframe from site-supplied HTML)', () => {
		expect(isAllowedEmbedUrl('https://www.youtube.com/embed/short')).toBe(false);
		expect(isAllowedEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
		expect(isAllowedEmbedUrl('http://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(false);
		expect(isAllowedEmbedUrl('https://evil.example/embed/dQw4w9WgXcQ')).toBe(false);
		expect(isAllowedEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ/extra')).toBe(false);
		expect(isAllowedEmbedUrl(null)).toBe(false);
		expect(isAllowedEmbedUrl(undefined)).toBe(false);
	});
});

describe('safeEmbedColor', () => {
	it('keeps #RRGGBB and drops anything else', () => {
		expect(safeEmbedColor('#5AC8fa')).toBe('#5AC8fa');
		expect(safeEmbedColor('#fff')).toBe('');
		expect(safeEmbedColor('red')).toBe('');
		expect(safeEmbedColor('rgba(0,0,0,1)')).toBe('');
		expect(safeEmbedColor(null)).toBe('');
	});
});

describe('embedHost / isHttpsUrl', () => {
	it('normalizes the host and requires https for the video relay', () => {
		expect(embedHost('https://www.example.com/a/b')).toBe('example.com');
		expect(embedHost('not a url')).toBe('');
		expect(embedHost(null)).toBe('');
		expect(isHttpsUrl('https://cdn.example.com/v.mp4')).toBe(true);
		expect(isHttpsUrl('http://cdn.example.com/v.mp4')).toBe(false);
	});
});

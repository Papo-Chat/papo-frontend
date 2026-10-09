// Vitest on embed display helpers (utils/embeds.ts): iframe allowlist, color
// guard, host label and the https requirement of the video relay.

import { describe, it, expect } from 'vitest';
import type { Embed } from '../src/lib/types/models';
import {
	embedDirectVideoUrl,
	embedHost,
	embedIframeUrl,
	isAllowedEmbedUrl,
	isHttpsUrl,
	safeEmbedColor
} from '../src/lib/utils/embeds';

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

function linkEmbed(overrides: Partial<Embed> = {}): Embed {
	return {
		id: 'e1',
		source_type: 'link',
		fetch_method: 'oembed',
		url: 'https://www.youtube.com/watch?v=tfFn5tlaHD8',
		title: 'Christmas Playlist',
		created_at: '2026-10-09T03:03:19Z',
		...overrides
	};
}

describe('embedIframeUrl / embedDirectVideoUrl', () => {
	// Formato real do backend para YouTube (oEmbed): o iframe derivado do padrão
	// hardcoded chega em video.url, sem mime_type, e embed_url não vem.
	const youtube = linkEmbed({
		provider: 'YouTube',
		video: { url: 'https://www.youtube.com/embed/tfFn5tlaHD8' }
	});

	it('renders the YouTube player from video.url (no embed_url in the payload)', () => {
		expect(embedIframeUrl(youtube)).toBe('https://www.youtube.com/embed/tfFn5tlaHD8');
	});

	it('does not send the YouTube iframe page to the video relay', () => {
		// O relay rejeitaria o content-type (página, não vídeo): não há player.
		expect(embedDirectVideoUrl(youtube)).toBe('');
	});

	it('still accepts embed_url when the API provides it', () => {
		const legacy = linkEmbed({ embed_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' });

		expect(embedIframeUrl(legacy)).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
	});

	it('uses the relay for a direct video file (og:video / custom)', () => {
		const ogVideo = linkEmbed({
			fetch_method: 'opengraph',
			url: 'https://example.com/v',
			video: { url: 'https://cdn.example.com/v.mp4', mime_type: 'video/mp4' }
		});

		expect(embedDirectVideoUrl(ogVideo)).toBe('https://cdn.example.com/v.mp4');
		expect(embedIframeUrl(ogVideo)).toBe('');
	});

	it('never turns a non-allowlisted video url into an iframe', () => {
		const embed = linkEmbed({
			video: { url: 'https://evil.example/embed/dQw4w9WgXcQ', mime_type: 'video/mp4' }
		});

		expect(embedIframeUrl(embed)).toBe('');
		expect(embedDirectVideoUrl(embed)).toBe('https://evil.example/embed/dQw4w9WgXcQ');
	});

	it('rejects a plain-http video (the relay only proxies https)', () => {
		const embed = linkEmbed({ video: { url: 'http://cdn.example.com/v.mp4' } });

		expect(embedDirectVideoUrl(embed)).toBe('');
		expect(embedIframeUrl(embed)).toBe('');
	});
});

// Vitest on embed helpers (utils/embeds.ts): iframe allowlist, color guard and
// the EmbedDraft ↔ EmbedInput conversion used by the composer and message edit.

import { describe, it, expect } from 'vitest';
import type { Embed } from '../src/lib/types/models';
import {
	EMBED_LIMITS,
	draftIsEmpty,
	draftToEmbedInput,
	embedHost,
	emptyEmbedDraft,
	embedToDraft,
	isAllowedEmbedUrl,
	isHttpsUrl,
	safeEmbedColor
} from '../src/lib/utils/embeds';

function customEmbed(id: string, overrides: Partial<Embed> = {}): Embed {
	return {
		id,
		source_type: 'custom',
		fetch_method: 'manual',
		title: 'T',
		description: 'D',
		url: 'https://example.com/x',
		color: '#5ac8fa',
		site_name: 'Example',
		author: { name: 'Ana', url: 'https://example.com/ana' },
		footer: { text: 'rodapé' },
		fields: [
			{ position: 0, name: 'Status', value: 'aberto', inline: true },
			{ position: 1, name: 'Votos', value: '3', inline: false }
		],
		video: { url: 'https://cdn.example.com/v.mp4', mime_type: 'video/mp4' },
		created_at: '2024-01-01T00:00:00Z',
		...overrides
	};
}

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

describe('draftToEmbedInput', () => {
	it('omits empty fields instead of sending empty strings', () => {
		expect(draftToEmbedInput(emptyEmbedDraft())).toEqual({});
		expect(draftIsEmpty(emptyEmbedDraft())).toBe(true);
	});

	it('sends video with a mime type (the relay requires one)', () => {
		const draft = emptyEmbedDraft();
		draft.video_url = 'https://cdn.example.com/v.webm';
		draft.video_mime = 'video/webm';

		expect(draftToEmbedInput(draft)).toEqual({
			video: { url: 'https://cdn.example.com/v.webm', mime_type: 'video/webm' }
		});
	});

	it('drops fields with no name and no value', () => {
		const draft = emptyEmbedDraft();
		draft.fields = [
			{ name: 'Status', value: '', inline: true },
			{ name: '', value: '', inline: false }
		];

		expect(draftToEmbedInput(draft)).toEqual({
			fields: [{ name: 'Status', value: '', inline: true }]
		});
	});
});

describe('embedToDraft', () => {
	it('round-trips a persisted custom embed back into the form', () => {
		const draft = embedToDraft(customEmbed('e1'));

		expect(draft.title).toBe('T');
		expect(draft.site_name).toBe('Example');
		expect(draft.author_name).toBe('Ana');
		expect(draft.footer_text).toBe('rodapé');
		expect(draft.video_url).toBe('https://cdn.example.com/v.mp4');
		expect(draft.video_mime).toBe('video/mp4');
		expect(draft.fields).toEqual([
			{ name: 'Status', value: 'aberto', inline: true },
			{ name: 'Votos', value: '3', inline: false }
		]);
	});

	it('never re-sends an image URL it cannot know (the backend serves only the thumbnail blob)', () => {
		const draft = embedToDraft(customEmbed('e1', { thumbnail: { mime_type: 'image/png' } }));

		expect(draft.thumbnail_url).toBe('');
		expect(draftToEmbedInput(draft).thumbnail).toBeUndefined();
	});

	it('keeps the form caps aligned with the backend limits', () => {
		// internal/services/embeds.go
		expect(EMBED_LIMITS).toEqual({
			embedsPerMessage: 10,
			title: 256,
			description: 4192,
			fieldsPerEmbed: 25,
			fieldName: 256,
			fieldValue: 1024,
			author: 256,
			siteName: 256,
			footer: 2048,
			url: 2048
		});
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchKlipyGif, parseKlipyLink } from '../src/lib/utils/klipy';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('parseKlipyLink', () => {
	it('extracts the slug when the message contains only a KLIPY GIF link', () => {
		expect(parseKlipyLink('https://klipy.com/gifs/seb-wordle-in-6')).toEqual({
			slug: 'seb-wordle-in-6',
			url: 'https://klipy.com/gifs/seb-wordle-in-6'
		});
	});

	it('accepts the singular route, www host, query params and trailing punctuation', () => {
		expect(parseKlipyLink('https://www.klipy.com/gif/funny_cat?ref=chat.')).toEqual({
			slug: 'funny_cat',
			url: 'https://www.klipy.com/gif/funny_cat?ref=chat'
		});
	});

	it('does not treat text plus a link as a link-only message', () => {
		expect(parseKlipyLink('look at this https://klipy.com/gifs/seb-wordle-in-6')).toBeNull();
	});

	it('rejects non-KLIPY hosts, HTTP and unrelated KLIPY paths', () => {
		expect(parseKlipyLink('https://klipy.com.evil.test/gifs/slug')).toBeNull();
		expect(parseKlipyLink('https://evil.example/gifs/slug')).toBeNull();
		expect(parseKlipyLink('http://klipy.com/gifs/slug')).toBeNull();
		expect(parseKlipyLink('https://klipy.com/search?q=slug')).toBeNull();
	});
});

describe('fetchKlipyGif', () => {
	it('requests the item through the user-entered key and returns the HD GIF URL', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				result: true,
				data: {
					data: [{
						slug: 'seb-wordle-in-6',
						title: 'Seb Wordle in 6',
						file: {
							hd: { gif: { url: 'https://static.klipy.com/ii/test.gif', width: 500, height: 300 } },
							md: { gif: { url: 'https://static.klipy.com/ii/medium.gif' } }
						}
					}]
				}
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await fetchKlipyGif('seb-wordle-in-6', 'my-user-key');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe(
			'https://api.klipy.com/api/v1/my-user-key/gifs/items?slugs=seb-wordle-in-6'
		);
		expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store', method: 'GET' });
		expect(result).toEqual({
			slug: 'seb-wordle-in-6',
			title: 'Seb Wordle in 6',
			url: 'https://static.klipy.com/ii/test.gif',
			width: 500,
			height: 300
		});
	});

	it('uses a lower rendition when HD is missing and rejects non-KLIPY media URLs', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				result: true,
				data: {
					data: [{
						slug: 'one',
						title: 'One',
						file: {
							hd: { gif: { url: 'https://evil.example/fake.gif' } },
							md: { gif: { url: 'https://static1.klipy.com/ii/ok.gif' } }
						}
					}]
				}
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await fetchKlipyGif('one', 'key');
		expect(result?.url).toBe('https://static1.klipy.com/ii/ok.gif');
	});

	it('is a no-op without a key or when the API returns no matching item', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		expect(await fetchKlipyGif('slug', '')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		fetchMock.mockResolvedValue({ ok: true, json: async () => ({ result: true, data: { data: [] } }) });
		expect(await fetchKlipyGif('slug', 'key')).toBeNull();
	});
});

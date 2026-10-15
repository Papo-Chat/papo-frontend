export interface KlipyLink {
	slug: string;
	url: string;
}

export interface KlipyGif {
	slug: string;
	title: string;
	url: string;
	width?: number;
	height?: number;
}

const KLIPY_PAGE_HOSTS = new Set(['klipy.com', 'www.klipy.com']);
const KLIPY_MEDIA_HOST = /^(static|static[0-9]+)\.klipy\.com$/i;

export function parseKlipyLink(content: string | null | undefined): KlipyLink | null {
	if (!content) return null;
	let raw = content.trim();
	if (raw.startsWith('<') && raw.endsWith('>')) raw = raw.slice(1, -1).trim();
	// Ignore punctuation commonly added at the end of a pasted link in chat.
	raw = raw.replace(/[.,!?;:]+$/, '');
	if (!raw) return null;

	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		return null;
	}
	if (parsed.protocol !== 'https:' || !KLIPY_PAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
		return null;
	}

	const match = parsed.pathname.match(/^\/gifs?\/([a-z0-9][a-z0-9_-]*)\/?$/i);
	if (!match) return null;
	return { slug: match[1], url: parsed.href };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function allowedMediaUrl(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	try {
		const url = new URL(raw);
		if (url.protocol !== 'https:' || !KLIPY_MEDIA_HOST.test(url.hostname.toLowerCase())) return null;
		return raw;
	} catch {
		return null;
	}
}

export async function fetchKlipyGif(
	slug: string,
	apiKey: string,
	signal?: AbortSignal
): Promise<KlipyGif | null> {
	const key = apiKey.trim();
	if (!key || !slug) return null;

	const endpoint =
		'https://api.klipy.com/api/v1/' +
		encodeURIComponent(key) +
		'/gifs/items?slugs=' +
		encodeURIComponent(slug);
	const response = await fetch(endpoint, {
		method: 'GET',
		cache: 'no-store',
		headers: { Accept: 'application/json' },
		signal
	});
	if (!response.ok) return null;

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		return null;
	}
	if (!isRecord(payload) || payload.result !== true || !isRecord(payload.data)) return null;
	const items = payload.data.data;
	if (!Array.isArray(items)) return null;
	const item = items.find((candidate) => isRecord(candidate) && candidate.slug === slug);
	if (!isRecord(item)) return null;

	const file = isRecord(item.file) ? item.file : null;
	if (!file) return null;
	for (const quality of ['hd', 'md', 'sm', 'xs']) {
		const rendition = isRecord(file[quality]) ? file[quality] : null;
		const gif = rendition && isRecord(rendition.gif) ? rendition.gif : null;
		if (!gif) continue;
		const url = allowedMediaUrl(gif.url);
		if (!url) continue;
		const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'GIF da KLIPY';
		return {
			slug,
			title,
			url,
			...(typeof gif.width === 'number' && gif.width > 0 ? { width: gif.width } : {}),
			...(typeof gif.height === 'number' && gif.height > 0 ? { height: gif.height } : {})
		};
	}
	return null;
}

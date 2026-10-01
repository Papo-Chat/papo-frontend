import { PUBLIC_GIPHY_API_KEY } from '$lib/env';

export type GiphyResolvedGif = {
	id: string;
	title: string;
	url: string;
	width: number;
	height: number;
};

type GiphyImage = {
	url?: string;
	width?: string;
	height?: string;
};

type GiphyApiResponse = {
	data?: {
		id?: string;
		title?: string;
		images?: {
			original?: GiphyImage;
			fixed_width?: GiphyImage;
			downsized?: GiphyImage;
		};
	};
};

const cache = new Map<string, Promise<GiphyResolvedGif>>();

export function isGiphyMarker(content: string): string | null {
	const match = /^giphy:([A-Za-z0-9_-]+)$/.exec(content.trim());
	return match?.[1] ?? null;
}

export function resolveGiphyGif(id: string): Promise<GiphyResolvedGif> {
	const cached = cache.get(id);
	if (cached) return cached;

	const promise = (async () => {
		if (!PUBLIC_GIPHY_API_KEY) {
			throw new Error('PUBLIC_GIPHY_API_KEY não configurada');
		}

		const response = await fetch(
			`https://api.giphy.com/v1/gifs/${encodeURIComponent(id)}?api_key=${encodeURIComponent(PUBLIC_GIPHY_API_KEY)}`
		);
		if (!response.ok) {
			throw new Error(`GIPHY ${response.status}`);
		}

		const payload = (await response.json()) as GiphyApiResponse;
		const gif = payload.data;
		const image = gif?.images?.original ?? gif?.images?.downsized ?? gif?.images?.fixed_width;
		if (!gif?.id || !image?.url) {
			throw new Error('GIF inválido');
		}

		return {
			id: gif.id,
			title: gif.title || 'GIF',
			url: image.url,
			width: Number(image.width) || 0,
			height: Number(image.height) || 0
		};
	})();

	cache.set(id, promise);
	promise.catch(() => cache.delete(id));
	return promise;
}

// Media helpers: base-URL-aware URL builders, one-time base64→objectURL
// conversion (LRU-cached, F15), and binary resource fetching.

import { PUBLIC_API_URL } from '../env';
import type { EmbedMedia, MessageAttachment } from '../types/models';
import { isImageMime } from './text';

// Image format (PNG/JPEG/JPG/WEBP/GIF) ↔ MIME.
const FORMAT_TO_MIME: Record<string, string> = {
	PNG: 'image/png',
	JPEG: 'image/jpeg',
	JPG: 'image/jpeg',
	WEBP: 'image/webp',
	GIF: 'image/gif',
	AVIF: 'image/avif'
};

const MIME_TO_FORMAT: Record<string, string> = {
	'image/png': 'PNG',
	'image/jpeg': 'JPEG',
	'image/webp': 'WEBP',
	'image/gif': 'GIF',
	'image/avif': 'AVIF'
};

export function formatToMime(format: string): string {
	return FORMAT_TO_MIME[format] ?? format;
}

export function mimeToFormat(mime: string): string {
	return MIME_TO_FORMAT[mime] ?? mime;
}

// Base URL from PUBLIC_API_URL (empty → same-origin).
function apiBase(): string {
	const base = (PUBLIC_API_URL ?? '').replace(/\/$/, '');
	return base;
}

// GET /media/:sha_hash — user banners, server icons (sha variant).
export function mediaUrl(sha: string): string {
	return `${apiBase()}/media/${encodeURIComponent(sha)}`;
}

// GET /embeds/:embed_id/video — relay autenticado do vídeo do embed (suporta
// Range). Usado no lugar da URL original para não hotlinkar o CDN de origem.
export function embedVideoUrl(embedId: string): string {
	return `${apiBase()}/embeds/${encodeURIComponent(embedId)}/video`;
}

// GET /webhooks/:webhook_id/avatar — avatar persistente do webhook (público,
// sem cookie, como o avatar de usuário).
export function webhookAvatarUrl(webhookId: string): string {
	return `${apiBase()}/webhooks/${encodeURIComponent(webhookId)}/avatar`;
}

// Resolve o avatar_url de um external_author: caminhos do backend (ex.:
// /webhooks/<id>/avatar do avatar persistente) são resolvidos contra a origem
// da API; URLs absolutas externas (CDN de origem) passam intactas.
export function resolveExternalAvatarUrl(url: string): string {
	if (url.startsWith('/')) {
		return `${apiBase()}${url}`;
	}
	return url;
}

// GET /attachments/:file_id — full attachment download.
export function attachmentUrl(id: string): string {
	return `${apiBase()}/attachments/${encodeURIComponent(id)}`;
}

// GET /attachments/:file_id/thumbnail — inline thumbnail.
export function attachmentThumbnailUrl(id: string): string {
	return `${apiBase()}/attachments/${encodeURIComponent(id)}/thumbnail`;
}

export interface MediaBox {
	width: number;
	height: number;
}

// Margem do IntersectionObserver que dispara o download de mídia: a mídia é
// pedida ainda fora da tela, então baixa e decodifica antes de entrar no
// viewport (sem pop-in e sem tranco no scroll). Vale para attachments e embeds.
export const MEDIA_PRELOAD_MARGIN = '1024px 0px';

// Geometria do bitmap que o frontend exibe inline (reserva de box antes do
// download → o scroll não pula quando a mídia é decodificada).
//
// Para imagem comum o bitmap exibido é a própria thumbnail, então as
// dimensões dela (attachment_thumbnails no backend) são exatas. Para GIF
// exibe-se o original (a thumbnail reprocessada não anima) e a API só traz a
// geometria da thumbnail → reservar por ela mudaria o tamanho final do GIF,
// então não reservamos. null = sem reserva (a imagem entra com seu tamanho
// natural, ainda assim baixada fora da tela).
export function attachmentMediaBox(attachment: MessageAttachment): MediaBox | null {
	const { thumbnail_width: width, thumbnail_height: height } = attachment;
	if (attachment.thumbnail_id === null || width === null || height === null) return null;
	if (width <= 0 || height <= 0) return null;
	if (isImageMime(attachment.mime_type).isGif) return null;
	return { width, height };
}

// Geometria declarada de uma mídia de embed (embed.thumbnail / embed.image).
// O resumo do embed chega na resposta de mensagens, então a proporção está
// disponível antes do GET /embeds/:id que traz o image_data (base64): é o que
// permite reservar o box do card e o scroll não pular quando o embed chega.
export function embedMediaBox(media?: EmbedMedia | null): MediaBox | null {
	const width = media?.width;
	const height = media?.height;
	if (!width || !height || width <= 0 || height <= 0) return null;
	return { width, height };
}

// Fetch a binary resource and return the Blob. The caller is responsible for
// auth (the native fetch here uses the same-origin HttpOnly Auth cookie).
export async function fetchMediaBlob(url: string, signal?: AbortSignal): Promise<Blob> {
	const res = await fetch(url, { signal, credentials: 'include' });
	if (!res.ok) {
		throw new Error(`media fetch failed: ${res.status} ${res.statusText}`);
	}
	return res.blob();
}

// ── base64 → objectURL (LRU cache) ─────────────────────

const LRU_MAX = 64;

interface CacheEntry {
	url: string;
	mime: string;
}

// FNV-1a 64-bit content hash (BigInt key → content-based, reference-independent).
function fnv1a64(str: string): bigint {
	let hash = 0xcbf29ce484222325n;
	const prime = 0x100000001b3n;
	for (let i = 0; i < str.length; i++) {
		hash ^= BigInt(str.charCodeAt(i));
		hash = (hash * prime) & 0xffffffffffffffffn;
	}
	return hash;
}

const cache = new Map<bigint, CacheEntry>();

interface LogicalCacheEntry extends CacheEntry {
	base64: string;
	format: string;
}

// Stable resource identities (avatar:userId, emoji:emojiId, etc.) bypass the
// content hash entirely. Hashing a large base64 string with BigInt on every
// component mount is expensive even when the resulting object URL is cached.
const logicalCache = new Map<string, LogicalCacheEntry>();

// Convert a base64 blob to a one-time objectURL, cached (LRU). Returns ''
// when there is no base64 or when running outside a browser environment.
// `format` is the image format (PNG/JPEG/JPG/WEBP/GIF); it is converted to a
// MIME for the Blob. Pass a stable `cacheKey` when the caller has a logical
// resource identity; this avoids hashing the whole base64 payload on cache hits.
export function blobToUrl(base64: string, format: string, cacheKey?: string): string {
	if (!base64) {
		return '';
	}
	if (typeof atob === 'undefined' || typeof Blob === 'undefined' || typeof window === 'undefined') {
		return '';
	}
	const mime = formatToMime(format);

	if (cacheKey) {
		const logicalHit = logicalCache.get(cacheKey);
		if (logicalHit && logicalHit.base64 === base64 && logicalHit.format === format) {
			return logicalHit.url;
		}
		if (logicalHit) {
			URL.revokeObjectURL(logicalHit.url);
			logicalCache.delete(cacheKey);
		}
		const bin = atob(base64);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) {
			bytes[i] = bin.charCodeAt(i);
		}
		const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
		logicalCache.set(cacheKey, { url, mime, base64, format });
		return url;
	}

	const key = fnv1a64(`${format}:${base64}`);
	const hit = cache.get(key);
	if (hit) {
		// LRU touch.
		cache.delete(key);
		cache.set(key, hit);
		return hit.url;
	}
	const bin = atob(base64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) {
		bytes[i] = bin.charCodeAt(i);
	}
	const blob = new Blob([bytes], { type: mime });
	const url = URL.createObjectURL(blob);
	cache.set(key, { url, mime });
	if (cache.size > LRU_MAX) {
		const firstKey = cache.keys().next().value;
		if (firstKey !== undefined) {
			const first = cache.get(firstKey);
			if (first) {
				cache.delete(firstKey);
				URL.revokeObjectURL(first.url);
			}
		}
	}
	return url;
}

export function revokeBlobKey(cacheKey: string): void {
	if (typeof window === 'undefined') {
		return;
	}
	const entry = logicalCache.get(cacheKey);
	if (!entry) {
		return;
	}
	logicalCache.delete(cacheKey);
	URL.revokeObjectURL(entry.url);
}

// Best-effort revoke of a previously returned objectURL (e.g. on channel evict).
export function revokeBlobUrl(url: string): void {
	if (!url) {
		return;
	}
	if (typeof window === 'undefined') {
		return;
	}
	for (const [key, entry] of logicalCache) {
		if (entry.url === url) {
			logicalCache.delete(key);
			URL.revokeObjectURL(url);
			return;
		}
	}
	for (const [key, entry] of cache) {
		if (entry.url === url) {
			cache.delete(key);
			URL.revokeObjectURL(url);
			return;
		}
	}
}

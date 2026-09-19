// Media helpers: base-URL-aware URL builders, one-time base64→objectURL
// conversion (LRU-cached, F15), and binary resource fetching.

import { PUBLIC_API_URL } from '../env';

// Image format (PNG/JPEG/JPG/WEBP/GIF) ↔ MIME.
const FORMAT_TO_MIME: Record<string, string> = {
	PNG: 'image/png',
	JPEG: 'image/jpeg',
	JPG: 'image/jpeg',
	WEBP: 'image/webp',
	GIF: 'image/gif'
};

const MIME_TO_FORMAT: Record<string, string> = {
	'image/png': 'PNG',
	'image/jpeg': 'JPEG',
	'image/webp': 'WEBP',
	'image/gif': 'GIF'
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

// GET /attachments/:file_id — full attachment download.
export function attachmentUrl(id: string): string {
	return `${apiBase()}/attachments/${encodeURIComponent(id)}`;
}

// GET /attachments/:file_id/thumbnail — inline thumbnail.
export function attachmentThumbnailUrl(id: string): string {
	return `${apiBase()}/attachments/${encodeURIComponent(id)}/thumbnail`;
}

// Fetch a binary resource and return the Blob. The caller is responsible for
// auth (the native fetch here uses the same-origin HttpOnly Auth cookie).
export async function fetchMediaBlob(url: string, signal?: AbortSignal): Promise<Blob> {
	const res = await fetch(url, { signal });
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

// Convert a base64 blob to a one-time objectURL, cached (LRU). Returns ''
// when there is no base64 or when running outside a browser environment.
// `format` is the image format (PNG/JPEG/JPG/WEBP/GIF); it is converted to a
// MIME for the Blob. The key includes the format so two payloads with the
// same base64 but different format metadata are not shared.
export function blobToUrl(base64: string, format: string): string {
	if (!base64) {
		return '';
	}
	if (typeof atob === 'undefined' || typeof Blob === 'undefined' || typeof window === 'undefined') {
		return '';
	}
	const mime = formatToMime(format);
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

// Best-effort revoke of a previously returned objectURL (e.g. on channel evict).
export function revokeBlobUrl(url: string): void {
	if (!url) {
		return;
	}
	if (typeof window === 'undefined') {
		return;
	}
	for (const [key, entry] of cache) {
		if (entry.url === url) {
			cache.delete(key);
			URL.revokeObjectURL(url);
			break;
		}
	}
}

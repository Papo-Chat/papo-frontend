// Derivações de exibição de um Embed. Não há autoriação de embeds no frontend:
// os embeds vêm do backend (crawl de link ou embeds customizados de outros
// clientes) e aqui são apenas renderizados.

import type { Embed } from '../types';

// Iframe allowlist: o embed de YouTube é derivado por padrão hardcoded do
// backend (internal/services/oembed.go youtubeEmbedURL). O frontend revalida o
// mesmo padrão antes de renderizar o iframe — nunca renderiza HTML/URL
// recebido do site.
const YOUTUBE_EMBED_RE = /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}$/;

const EMBED_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isAllowedEmbedUrl(embedUrl: string | null | undefined): boolean {
	return typeof embedUrl === 'string' && YOUTUBE_EMBED_RE.test(embedUrl);
}

// Cor do embed (#RRGGBB). Valor fora do formato cai no padrão do tema.
export function safeEmbedColor(color: string | null | undefined): string {
	return typeof color === 'string' && EMBED_COLOR_RE.test(color) ? color : '';
}

// Host legível da URL do embed.
export function embedHost(url: string | null | undefined): string {
	if (!url) return '';
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
}

// O relay de vídeo do backend só aceita HTTPS.
export function isHttpsUrl(url: string | null | undefined): boolean {
	if (!url) return false;
	try {
		return new URL(url).protocol === 'https:';
	} catch {
		return false;
	}
}

// URL do iframe allowlistado, se o embed tiver um. O backend deriva o embed do
// YouTube por padrão hardcoded e o entrega em `video` (fetchOEmbedLinkEmbed:
// EmbedMedia só com URL, sem mime_type); `embed_url` continua no contrato da
// API. Fora do padrão allowlistado nada vira iframe.
export function embedIframeUrl(embed: Embed): string {
	for (const candidate of [embed.embed_url, embed.video?.url]) {
		if (isAllowedEmbedUrl(candidate)) return candidate;
	}
	return '';
}

// URL de vídeo reproduzível pelo relay autenticado do backend
// (GET /embeds/:id/video): HTTPS e não ser o iframe allowlistado, que é página
// de player e não arquivo de vídeo (o relay rejeitaria o content-type).
export function embedDirectVideoUrl(embed: Embed): string {
	const url = embed.video?.url;
	if (!url || !isHttpsUrl(url) || isAllowedEmbedUrl(url)) return '';
	return url;
}

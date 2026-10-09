// Derivações de exibição de um Embed. Não há autoriação de embeds no frontend:
// os embeds vêm do backend (crawl de link ou embeds customizados de outros
// clientes) e aqui são apenas renderizados.

// Iframe allowlist: `embed_url` vem de padrão hardcoded do backend (MVP:
// YouTube). O frontend revalida antes de renderizar o iframe — nunca renderiza
// HTML/URL recebido do site.
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

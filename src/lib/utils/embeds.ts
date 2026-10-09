// Embed helpers: derivações de exibição de um Embed e conversão dos embeds
// customizados de uma mensagem de volta em EmbedInput (PUT /messages/:id
// substitui a lista completa de customizados).

import type { Embed, EmbedFieldInput, EmbedInput } from '../types';

// Iframe allowlist: `embed_url` vem de padrão hardcoded do backend (MVP:
// YouTube). O frontend revalida antes de renderizar o iframe — nunca renderiza
// HTML/URL recebido do site.
const YOUTUBE_EMBED_RE = /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}$/;

const EMBED_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Limites aplicados pelo backend (IMPLEMENTACAO_EMBEDS.md §5), contados por
// caractere Unicode.
export const EMBED_LIMITS = {
	embedsPerMessage: 10,
	title: 256,
	description: 4192,
	fieldsPerEmbed: 25,
	fieldName: 256,
	fieldValue: 1024,
	author: 256,
	// site_name usa o mesmo teto do nome do autor no backend.
	siteName: 256,
	footer: 2048,
	url: 2048
} as const;

// Allowlist de MIME de vídeo do relay do backend.
export const EMBED_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/ogg'] as const;

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

// ── embeds customizados (autorias no composer / edição) ──

// Formulário editável de um embed customizado. Tudo string vazia = ausente.
// `id` é identidade local do formulário (chave de listagem); nunca é enviado.
export interface EmbedDraftField {
	name: string;
	value: string;
	inline: boolean;
}

export interface EmbedDraft {
	id: string;
	title: string;
	description: string;
	url: string;
	color: string;
	site_name: string;
	author_name: string;
	author_url: string;
	footer_text: string;
	thumbnail_url: string;
	video_url: string;
	video_mime: string;
	fields: EmbedDraftField[];
}

let embedDraftSeq = 0;

function newEmbedDraftId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	embedDraftSeq += 1;
	return `embed-draft-${embedDraftSeq}`;
}

export function emptyEmbedDraft(): EmbedDraft {
	return {
		id: newEmbedDraftId(),
		title: '',
		description: '',
		url: '',
		color: '',
		site_name: '',
		author_name: '',
		author_url: '',
		footer_text: '',
		thumbnail_url: '',
		video_url: '',
		video_mime: 'video/mp4',
		fields: []
	};
}

// Reconstrói o formulário a partir de um embed customizado já persistido.
// A imagem do embed não é autoral aqui: o backend só serve o blob da thumbnail
// (GET /embeds/:id → image_data) e nenhuma URL de imagem é exposta, então a
// thumbnail não pode ser reenviada.
export function embedToDraft(embed: Embed): EmbedDraft {
	return {
		id: embed.id,
		title: embed.title ?? '',
		description: embed.description ?? '',
		url: embed.url ?? '',
		color: safeEmbedColor(embed.color),
		site_name: embed.site_name ?? '',
		author_name: embed.author?.name ?? '',
		author_url: embed.author?.url ?? '',
		footer_text: embed.footer?.text ?? '',
		thumbnail_url: '',
		video_url: embed.video?.url ?? '',
		video_mime: embed.video?.mime_type ?? 'video/mp4',
		fields: (embed.fields ?? []).map((field) => ({
			name: field.name,
			value: field.value,
			inline: field.inline
		}))
	};
}

function trimmed(value: string): string {
	return value.trim();
}

// Converte o formulário em EmbedInput omitindo campos vazios. O backend fixa
// source_type/fetch_method e valida limites, URLs e MIME.
export function draftToEmbedInput(draft: EmbedDraft): EmbedInput {
	const input: EmbedInput = {};

	const title = trimmed(draft.title);
	if (title) input.title = title;

	const description = trimmed(draft.description);
	if (description) input.description = description;

	const url = trimmed(draft.url);
	if (url) input.url = url;

	const color = safeEmbedColor(draft.color);
	if (color) input.color = color;

	const siteName = trimmed(draft.site_name);
	if (siteName) input.site_name = siteName;

	const authorName = trimmed(draft.author_name);
	const authorUrl = trimmed(draft.author_url);
	if (authorName || authorUrl) {
		input.author = {
			...(authorName ? { name: authorName } : {}),
			...(authorUrl ? { url: authorUrl } : {})
		};
	}

	const footerText = trimmed(draft.footer_text);
	if (footerText) input.footer = { text: footerText };

	const thumbnailUrl = trimmed(draft.thumbnail_url);
	if (thumbnailUrl) input.thumbnail = { url: thumbnailUrl };

	const videoUrl = trimmed(draft.video_url);
	if (videoUrl) {
		input.video = {
			url: videoUrl,
			mime_type: trimmed(draft.video_mime) || 'video/mp4'
		};
	}

	const fields: EmbedFieldInput[] = draft.fields
		.map((field) => ({
			name: trimmed(field.name),
			value: trimmed(field.value),
			inline: field.inline
		}))
		.filter((field) => field.name !== '' || field.value !== '');
	if (fields.length) input.fields = fields;

	return input;
}

export function draftIsEmpty(draft: EmbedDraft): boolean {
	return Object.keys(draftToEmbedInput(draft)).length === 0;
}

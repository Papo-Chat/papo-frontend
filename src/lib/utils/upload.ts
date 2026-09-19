// upload.ts — file → base64 (validated + canvas-resized) and FormData builder.
//
// The pure validation (mime/size) and the constants are exported and node-
// testable. The canvas resize and the FormData builder are browser-only
// (guarded so importing this module in node does not throw).
//
// Limits mirror the backend (services/ + utils/):
//   formats  : GIF, JPEG/JPG, PNG, WEBP
//   avatar   : ≤2MB, ≤512px
//   icon     : ≤2MB, ≤512px
//   banner   : ≤2MB, ≤2048px
//   emoji    : ≤256KB, ≤512px
//   attachments: ≤10 files, ≤100MB total (multipart POST /messages, F13)
//
// RESIZE_DIM is the *client-side* canvas downscale target (longest side, px).
// It is kept at or under the backend max so the resized blob still validates.

import { formatBytes } from './text';

// ── constants (pure) ─────────────────────────────────────

export const IMAGE_MIMES = ['image/gif', 'image/jpeg', 'image/png', 'image/webp'] as const;

export type UploadKind = 'avatar' | 'icon' | 'emoji' | 'banner';

// Decoded byte limits (mirrors backend validation).
export const MAX_UPLOAD_BYTES: Record<UploadKind, number> = {
	avatar: 2 * 1024 * 1024,
	icon: 2 * 1024 * 1024,
	emoji: 256 * 1024,
	banner: 2 * 1024 * 1024
};

// Canvas resize target — longest side, px (client downscale). 0 = no resize.
export const RESIZE_DIM: Record<UploadKind, number> = {
	avatar: 512,
	icon: 512,
	emoji: 128,
	banner: 2048
};

// Attachment budget (multipart POST /messages).
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_TOTAL = 100 * 1024 * 1024;

// ── pure validation (node-testable) ─────────────────────

export interface UploadValidation {
	ok: boolean;
	errors: string[];
}

export function isValidImageMime(mime: string): boolean {
	return (IMAGE_MIMES as readonly string[]).includes(mime);
}

// Validates a file's mime + size for the given kind. Pure: takes a plain
// { size, type } so it is testable without a real File.
export function validateUpload(
	file: { size: number; type: string },
	kind: UploadKind
): UploadValidation {
	const errors: string[] = [];
	if (!isValidImageMime(file.type)) {
		errors.push('tipo inválido; use GIF, JPEG/JPG, PNG ou WEBP');
	}
	if (file.size > MAX_UPLOAD_BYTES[kind]) {
		errors.push(`excede o tamanho máximo de ${formatBytes(MAX_UPLOAD_BYTES[kind])}`);
	}
	return { ok: errors.length === 0, errors };
}

// ── FormData builder (browser-only) ──────────────────────

export interface MessageFormPayload {
	channelId: string;
	content: string | null;
	replyTo?: string | null;
	files?: File[];
}

// Builds the multipart form for POST /messages (field names per F13).
// Enforces the attachment budget (10 files, 100MB total).
export function buildMessageForm(payload: MessageFormPayload): FormData {
	const { channelId, content, replyTo, files = [] } = payload;
	if (files.length > MAX_ATTACHMENTS) {
		throw new Error(`máximo de ${MAX_ATTACHMENTS} attachments por mensagem`);
	}
	const total = files.reduce((acc, f) => acc + f.size, 0);
	if (total > MAX_ATTACHMENT_TOTAL) {
		throw new Error(`attachments excedem o tamanho máximo de ${formatBytes(MAX_ATTACHMENT_TOTAL)}`);
	}
	const form = new FormData();
	form.append('channel_id', channelId);
	if (content != null) {
		form.append('content', content);
	}
	if (replyTo != null) {
		form.append('reply_to', replyTo);
	}
	for (const f of files) {
		form.append('attachments', f);
	}
	return form;
}

// ── canvas resize (browser-only) ─────────────────────────

export interface Base64Image {
	base64: string;
	mime: string;
}

type WinWithBitmap = {
	createImageBitmap?: (blob: Blob) => Promise<ImageBitmap>;
};

// Reads a File, resizes it (longest side → RESIZE_DIM[kind]) via canvas, and
// returns { base64, mime }. Validates mime/size first (pure).
//
// GIFs are never resized: canvas would flatten the animation to a single
// frame. Within the size limit they are sent as-is.
//
// Browser-only: throws in non-browser environments.
export async function fileToBase64(file: File, kind: UploadKind): Promise<Base64Image> {
	if (typeof document === 'undefined') {
		throw new Error('ambiente sem canvas (navegador necessário)');
	}
	const v = validateUpload(file, kind);
	if (!v.ok) {
		throw new Error(v.errors.join('; '));
	}
	const isGif = file.type === 'image/gif';
	const blob = isGif ? file : await resizeToBlob(file, RESIZE_DIM[kind]);
	return { base64: await blobToBase64(blob), mime: blob.type || file.type };
}

async function resizeToBlob(file: File, dim: number): Promise<Blob> {
	// No resize needed.
	if (dim <= 0) {
		return file;
	}
	const create = (window as WinWithBitmap).createImageBitmap;
	if (!create) {
		// Fall back to the original blob (still within backend limits).
		return file;
	}
	try {
		const bitmap = await create(file);
		try {
			const scale = Math.min(1, dim / Math.max(bitmap.width, bitmap.height));
			const w = Math.max(1, Math.round(bitmap.width * scale));
			const h = Math.max(1, Math.round(bitmap.height * scale));
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				// Fall back to the original blob (still within backend limits).
				return file;
			}
			ctx.drawImage(bitmap, 0, 0, w, h);
			return await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(b) => (b ? resolve(b) : reject(new Error('falha ao exportar imagem'))),
					file.type
				);
			});
		} finally {
			bitmap.close();
		}
	} catch {
		// Fall back to the original blob (still within backend limits).
		return file;
	}
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			// readAsDataURL returns `data:image/webp;base64,UklGR...`; the
			// backend expects only the base64 payload. Strip the prefix.
			const dataUrl = String(reader.result ?? '');
			const comma = dataUrl.indexOf(',');
			resolve(comma === -1 ? dataUrl : dataUrl.slice(comma + 1));
		};
		reader.onerror = () => reject(new Error('falha ao ler o arquivo'));
		reader.readAsDataURL(blob);
	});
}

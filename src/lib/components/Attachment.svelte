<script lang="ts">
	import type { MessageAttachment } from '$lib/types';
	import { attachmentUrl, attachmentThumbnailUrl } from '$lib/utils/media';
	import { formatBytes, isImageMime } from '$lib/utils/text';

	let { attachment } = $props<{ attachment: MessageAttachment }>();

	const thumbUrl = $derived(
		attachment.thumbnail_id !== null ? attachmentThumbnailUrl(attachment.id) : ''
	);
	const fullUrl = $derived(attachmentUrl(attachment.id));
	const name = attachment.original_file_name || 'anexo';
	const isImage = isImageMime(attachment.mime_type);
</script>

{#if (attachment.thumbnail_id !== null && isImage.isImage)}
	<!-- Imagem: thumbnail inline, clique abre o original. -->
	<a class="attachment-image" href={fullUrl} target="_blank" rel="noopener">
	<!-- Nos nao animamos gifs reprocessados, entao usamos o original -->
	{#if isImage.isGif}
		<img src={fullUrl} alt={name} loading="lazy" />
	{:else}
		<img src={thumbUrl} alt={name} loading="lazy" />
	{/if}
		<span class="attachment-name">{name}</span>
	</a>
{:else if (attachment.mime_type.startsWith('video/') || attachment.mime_type.startsWith('application/octet-stream')) }
	<!-- Vídeo: player inline (o backend suporta Range requests). -->
	<div class="attachment-media">
		<video src={fullUrl} controls></video>
		<span class="attachment-name">{name}</span>
	</div>
{:else if attachment.mime_type.startsWith('audio/')}
	<!-- Áudio: player inline. -->
	<div class="attachment-media">
		<audio src={fullUrl} controls></audio>
		<span class="attachment-name">{name}</span>
	</div>
{:else}
	<!-- Arquivo: chip de download. -->
	<a class="attachment-file pill"  href={fullUrl} download={name} target="_blank" rel="noopener">
		<span class="attachment-icon">📎</span>
		<span class="attachment-name">{name}</span>
		{#if attachment.size_bytes > 0}
			<span class="attachment-size">{formatBytes(attachment.size_bytes)}</span>
		{/if}
	</a>
{/if}

<style>
	.attachment-image {
		display: block;
		max-width: 100%;
		margin: 2px 0;
	}
	.attachment-image img {
		display: block;
		width: auto;
		max-width: 100%;
		max-height: 360px;
		border-radius: 10px;
	}
	.attachment-media {
		display: block;
		max-width: 100%;
		margin: 2px 0;
	}
	.attachment-media video,
	.attachment-media audio {
		width: 100%;
		max-width: 480px;
		border-radius: 10px;
	}
	.attachment-name {
		font-size: 12px;
		color: var(--text-secondary);
	}
	.attachment-image .attachment-name,
	.attachment-media .attachment-name {
		display: block;
		margin-top: 4px;
	}
	.attachment-file {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 4px 10px;
		color: var(--text-primary);
		text-decoration: none;
		margin: 2px 0 2px 4px;
	}
	.attachment-file:hover {
		background: var(--hover);
	}
	.attachment-icon {
		font-size: 12px;
		line-height: 1;
	}
	.attachment-size {
		font-size: 11px;
		color: var(--muted-soft);
	}
</style>

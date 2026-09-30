<script lang="ts">
	import type { MessageAttachment } from '$lib/types';
	import { attachmentUrl, attachmentThumbnailUrl } from '$lib/utils/media';
	import { formatBytes, isImageMime } from '$lib/utils/text';

	let { attachment } = $props<{ attachment: MessageAttachment }>();

	let lightboxOpen = $state(false);
	let lightbox: HTMLDialogElement | undefined = $state();

	const thumbUrl = $derived(
		attachment.thumbnail_id !== null ? attachmentThumbnailUrl(attachment.id) : ''
	);

	const fullUrl = $derived(attachmentUrl(attachment.id));
	const name = attachment.original_file_name || 'anexo';
	const isImage = isImageMime(attachment.mime_type);

	function openLightbox(): void {
		lightboxOpen = true;
	}

	function closeLightbox(): void {
		lightbox?.close();
		lightboxOpen = false;
	}

	function closeOnBackground(e: MouseEvent): void {
		if (e.target === e.currentTarget) {
			closeLightbox();
		}
	}

	$effect(() => {
		if (lightboxOpen && lightbox && !lightbox.open) {
			lightbox.showModal();
		}
	});
</script>

{#if (attachment.thumbnail_id !== null && isImage.isImage)}
	<!-- Imagem: thumbnail inline; o clique abre o original em lightbox (in-app). -->
	<button
		type="button"
		class="attachment-image"
		aria-label={`Abrir ${name} em tela cheia`}
		onclick={openLightbox}
	>
		<!-- Nos nao animamos gifs reprocessados, entao usamos o original -->
		{#if isImage.isGif}
			<img src={fullUrl} alt={name} loading="lazy" />
		{:else}
			<img src={thumbUrl} alt={name} loading="lazy" />
		{/if}
	</button>

	{#if lightboxOpen}
	<dialog
		bind:this={lightbox}
		class="lightbox"
		aria-label={name}
		onclick={closeOnBackground}
		oncancel={(e) => {
			e.preventDefault();
			closeLightbox();
		}}
	>
		<img class="lightbox-image" src={fullUrl} alt={name} />

		<button
			type="button"
			class="lightbox-close"
			onclick={closeLightbox}
			aria-label="Fechar"
		>
			✕
		</button>
	</dialog>
{/if}
{:else if (attachment.mime_type.startsWith('video/') || attachment.mime_type.startsWith('application/octet-stream')) }
	<!-- Vídeo: player inline (o backend suporta Range requests). -->
	<div class="attachment-media">
		<video src={fullUrl} controls></video>
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
		padding: 0;
		border: none;
		background: none;
		max-width: 100%;
		margin: 2px 0;
		cursor: zoom-in;

		/* mesma responsividade da bubble (aero.css):
		 * hover sobe 2px; press escala 0.995. */
		transition: transform 0.22s var(--ease);
	}
	.attachment-image:hover {
		transform: translateY(-2px);
	}
	.attachment-image:active {
		transform: translateY(0) scale(0.995);
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

		transition: transform 0.22s var(--ease);
	}
	.attachment-file:hover {
		background: var(--hover);
		transform: translateY(-2px);
	}
	.attachment-file:active {
		transform: translateY(0) scale(0.995);
	}
	.attachment-icon {
		font-size: 12px;
		line-height: 1;
	}
	.attachment-size {
		font-size: 11px;
		color: var(--muted-soft);
	}

	/* Lightbox: imagem original expandida em tela cheia com fundo blur,
	 * renderizada in-app (sem navegação, que causaria 404 via proxy). */
	.lightbox {
		position: fixed;
		inset: 0;

		width: 100vw;
		height: 100vh;
		max-width: none;
		max-height: none;

		margin: 0;
		padding: 0;
		border: none;

		display: flex;
		align-items: center;
		justify-content: center;

		background: transparent;
		overflow: hidden;
		cursor: zoom-out;
		box-sizing: border-box;
	}

	.lightbox::backdrop {
		background: rgba(8, 18, 34, 0.62);
		backdrop-filter: blur(14px) saturate(1.05);
		-webkit-backdrop-filter: blur(14px) saturate(1.05);
	}

	.lightbox-image {
		display: block;

		width: auto;
		height: auto;

		max-width: 80vw;
		max-height: 80vh;

		object-fit: contain;
		border-radius: 10px;
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);

		cursor: default;
	}

	.lightbox-close {
		position: fixed;
		top: 14px;
		right: 14px;

		display: flex;
		align-items: center;
		justify-content: center;

		width: 40px;
		height: 40px;

		font: inherit;
		font-size: 18px;
		line-height: 1;

		border: none;
		border-radius: 50%;

		background: rgba(0, 0, 0, 0.4);
		color: #fff;
		cursor: pointer;
	}

	.lightbox-close:hover {
		background: rgba(0, 0, 0, 0.6);
	}
	</style>

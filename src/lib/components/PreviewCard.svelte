<script lang="ts">
	import type { LinkPreview } from '$lib/types';
	import { getPreview, ensurePreview } from '$lib/store/messages.svelte';
	import { onMount } from 'svelte';
	import { blobToUrl, mimeToFormat } from '$lib/utils/media';
	import { truncate } from '$lib/utils/text';

	let { preview } = $props<{ preview: LinkPreview }>();
	let cardEl: HTMLElement | null = null;

	onMount(() => {
		if (!cardEl) return;
		const load = () => void ensurePreview(preview.id).catch(() => {});
		if (!('IntersectionObserver' in window)) {
			load();
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				load();
			},
			{ rootMargin: '320px' }
		);
		observer.observe(cardEl);
		return () => observer.disconnect();
	});

	// Preview completo (com image_data) vem do cache do store de mensagens.
	const resolved = $derived(getPreview(preview.id));

	const imageUrl = $derived(
		resolved && resolved.image_data
			? blobToUrl(resolved.image_data, mimeToFormat(resolved.image_mime_type ?? ''))
			: ''
	);

	const title = $derived(preview.title ?? truncate(preview.url, 60));

	function safeXVideoUrl(raw: string | null | undefined): string {
		if (!raw) return '';
		try {
			const url = new URL(raw);
			if (url.protocol !== 'https:') return '';
			const host = url.hostname.toLowerCase();
			if (host !== 'video.twimg.com' && !host.endsWith('.video.twimg.com')) return '';
			return url.href;
		} catch {
			return '';
		}
	}

	// O detalhe completo só é buscado quando o card chega perto do viewport.
	// Isso também impede que dezenas de vídeos iniciem preload fora da tela.
	const videoUrl = $derived(safeXVideoUrl(resolved?.video_url));
	let failedVideoUrl = $state('');

	function handleVideoError(): void {
		if (videoUrl) {
			failedVideoUrl = videoUrl;
		}
	}

	// Embed de vídeo: apenas se casar exatamente com o contrato do backend
	// (YouTube, ID válido). Frontend revalida antes de renderizar o iframe
	// (THUMBNAILS_IMPLEMENTATION.md §9.4).
	const isYoutube = $derived(
		preview.embed_url !== null &&
			/^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}$/.test(preview.embed_url)
	);

	let youtubeLoaded = $state(false);
	function openYouTube(): void {
		youtubeLoaded = true;
	}
</script>

<div class="preview-card" bind:this={cardEl}>
	<a class="preview-title" href={preview.url} target="_blank" rel="noopener noreferrer">
		{title}
	</a>

	<div class="preview-body">
		{#if isYoutube}
			{#if !youtubeLoaded}
				<button
					class="preview-yt-thumb"
					aria-label="Reproduzir vídeo"
					onclick={openYouTube}
				>
					{#if imageUrl}
						<img src={imageUrl} alt="" />
					{:else}
						<span class="preview-yt-bg" aria-hidden="true"></span>
					{/if}
					<span class="preview-yt-play" aria-hidden="true">▶</span>
				</button>
			{:else}
				<iframe
					class="preview-yt-iframe"
					src={preview.embed_url}
					title="Vídeo"
					allow="autoplay; encrypted-media; picture-in-picture"
					allowfullscreen
				></iframe>
			{/if}
		{:else if videoUrl && failedVideoUrl !== videoUrl}
			<video
				class="preview-video"
				src={videoUrl}
				poster={imageUrl || undefined}
				controls
				playsinline
				preload="metadata"
				onerror={handleVideoError}
			></video>
		{:else if imageUrl}
			<img class="preview-image" src={imageUrl} alt="" loading="lazy" />
		{/if}

		{#if preview.description}
			<p class="preview-description">{preview.description}</p>
		{/if}
		{#if preview.provider_name}
			<span class="preview-provider">{preview.provider_name}</span>
		{/if}
	</div>
</div>

<style>
	.preview-card {
		width: 100%;
		max-width: min(500px, 100%);
		min-width: 0;
		padding: 10px;
		box-sizing: border-box;
		overflow: hidden;
	}
	.preview-card .preview-title {
		display: block;
		max-width: 100%;
		overflow-wrap: anywhere;
		word-break: break-word;
		padding: 2px 0 2px;
		background: transparent;
		border-bottom: none;
		backdrop-filter: none;
		font-weight: 600;
		font-size: 14px;
		color: var(--text-primary);
		text-decoration: none;
	}

	.preview-card .preview-title:hover {
		text-decoration: underline;
	}

	.preview-body {
		width: 100%;
		max-width: 100%;
		min-width: 0;
		padding: 8px 0 0;
		box-sizing: border-box;
		overflow: hidden;
	}

	.preview-video {
		display: block;
		width: 100%;
		max-width: 100%;
		max-height: min(70dvh, 620px);
		aspect-ratio: 16 / 9;
		object-fit: contain;
		background: #000;
		border-radius: 10px;
		margin-bottom: 8px;
	}

	.preview-image {
		display: block;
		width: 100%;
		max-width: 100%;
		height: auto;
		object-fit: contain;
		border-radius: 10px;
		margin-bottom: 8px;
	}

	.preview-description {
		margin: 0 0 4px;
		max-width: 100%;
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}
	.preview-provider {
		display: block;
		font-size: 11px;
		color: var(--muted-soft);
	}
	.preview-yt-thumb {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		position: relative;
		border: none;
		border-radius: 10px;
		overflow: hidden;
		background: #0b1b2b;
		cursor: pointer;
		margin-bottom: 8px;
	}
	.preview-yt-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.preview-yt-bg {
		width: 100%;
		height: 100%;
		display: block;
		background: #0b1b2b;
	}
	.preview-yt-play {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 30px;
		line-height: 1;
		color: #fff;
		background: rgba(0, 0, 0, 0.35);
		border-radius: 10px;
	}
	.preview-yt-iframe {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		border: 0;
		border-radius: 10px;
		margin-bottom: 8px;
	}
</style>

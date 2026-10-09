<script lang="ts">
	import type { Embed } from '$lib/types';
	import { getEmbed, ensureEmbed } from '$lib/store/messages.svelte';
	import { onMount } from 'svelte';
	import { blobToUrl, embedVideoUrl, mimeToFormat } from '$lib/utils/media';
	import {
		embedDirectVideoUrl,
		embedHost,
		embedIframeUrl,
		safeEmbedColor
	} from '$lib/utils/embeds';
	import { truncate } from '$lib/utils/text';

	let { embed } = $props<{ embed: Embed }>();
	let cardEl: HTMLElement | null = null;

	onMount(() => {
		if (!cardEl) return;
		// A imagem (image_data) é só a thumbnail: sem thumbnail não há nada a
		// buscar, e o card só é buscado quando se aproxima do viewport.
		if (!embed.thumbnail) return;

		const load = () => void ensureEmbed(embed.id).catch(() => {});
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

	// Embed completo (com image_data) vem do cache do store de mensagens.
	const resolved = $derived(getEmbed(embed.id));

	const imageUrl = $derived(
		resolved?.image_data
			? blobToUrl(resolved.image_data, mimeToFormat(resolved.thumbnail?.mime_type ?? ''))
			: ''
	);

	const title = $derived(embed.title ?? truncate(embed.url ?? '', 60));
	const hasTitle = $derived(Boolean(embed.title || embed.url));
	const host = $derived(embedHost(embed.url));
	const sourceName = $derived(embed.site_name ?? embed.provider ?? host);
	const hasTopline = $derived(Boolean(sourceName));
	const authorName = $derived(embed.author?.name ?? '');
	const authorUrl = $derived(embed.author?.url ?? '');
	const footerText = $derived(embed.footer?.text ?? '');
	const fields = $derived(embed.fields ?? []);
	const color = $derived(safeEmbedColor(embed.color));
	const sourceInitial = $derived((sourceName || 'link').slice(0, 1).toUpperCase());

	// Vídeo direto (og:video / custom): o player usa o relay autenticado do
	// backend (GET /embeds/:id/video), nunca a URL de origem.
	const directVideo = $derived(embedDirectVideoUrl(embed));
	const videoUrl = $derived(directVideo ? embedVideoUrl(embed.id) : '');
	let failedVideoUrl = $state('');

	function handleVideoError(): void {
		if (videoUrl) {
			failedVideoUrl = videoUrl;
		}
	}

	// Iframe somente para o provedor allowlistado (padrão hardcoded do backend,
	// entregue em video.url sem mime_type: não é arquivo reproduzível pelo relay).
	const iframeUrl = $derived(embedIframeUrl(embed));

	let youtubeLoaded = $state(false);
	function openYouTube(): void {
		youtubeLoaded = true;
	}
</script>

<div class="embed-card" bind:this={cardEl} style={color ? `--embed-color: ${color}` : undefined}>
	{#if hasTopline}
		<header class="embed-topline">
			<span class="source-mark" aria-hidden="true">{sourceInitial}</span>
			<div class="source-meta">
				<p class="source-name">{sourceName}</p>
				{#if host}
					<span class="source-url">{host}</span>
				{/if}
			</div>
		</header>
	{/if}

	{#if authorName}
		<p class="embed-author">
			{#if authorUrl}
				<a href={authorUrl} target="_blank" rel="noopener noreferrer">{authorName}</a>
			{:else}
				{authorName}
			{/if}
		</p>
	{/if}

	{#if hasTitle}
		<h3 class="embed-heading">
			{#if embed.url}
				<a href={embed.url} target="_blank" rel="noopener noreferrer">{title}</a>
			{:else}
				{title}
			{/if}
		</h3>
	{/if}

	{#if embed.description}
		<p class="embed-description">{embed.description}</p>
	{/if}

	{#if fields.length}
		<div class="embed-data" aria-label="Detalhes">
			{#each fields as field (field.position)}
				<div class="data-chip" class:inline={field.inline}>
					{#if field.name}
						<span class="data-label">{field.name}</span>
					{/if}
					<span class="data-value">{field.value}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if iframeUrl}
		<div class="embed-media">
			{#if !youtubeLoaded}
				<button class="media-play-btn" aria-label="Reproduzir vídeo" onclick={openYouTube}>
					{#if imageUrl}
						<img src={imageUrl} alt="" loading="lazy" />
					{/if}
					<span class="media-play" aria-hidden="true">▶</span>
				</button>
			{:else}
				<iframe
					class="media-iframe"
					src={iframeUrl}
					title="Vídeo"
					allow="autoplay; encrypted-media; picture-in-picture"
					allowfullscreen
				></iframe>
			{/if}
		</div>
	{:else if videoUrl && failedVideoUrl !== videoUrl}
		<video
			class="embed-video"
			src={videoUrl}
			poster={imageUrl || undefined}
			controls
			playsinline
			preload="metadata"
			onerror={handleVideoError}
		></video>
	{:else if imageUrl}
		<img class="embed-image" src={imageUrl} alt="" loading="lazy" />
	{/if}

	{#if footerText}
		<footer class="embed-footer">
			<span>{footerText}</span>
		</footer>
	{/if}
</div>

<style>
	/* Aero embed: superfície glass + cor ambiente (não é a barra lateral do
	   Discord). As variáveis de tema (--text, --line-strong, --shadow-md,
	   --ease) vêm de theme.css; as de superfície são locais ao card. */
	.embed-card {
		--embed-color: var(--blue);
		--embed-surface: linear-gradient(145deg, rgba(255, 255, 255, 0.76), rgba(224, 242, 252, 0.62));
		--embed-inset: rgba(255, 255, 255, 0.64);
		--media-surface: linear-gradient(135deg, #d5effc, #cce8f5 52%, #dff7f0);
		--chip: rgba(255, 255, 255, 0.46);
		position: relative;
		isolation: isolate;
		display: block;
		width: 100%;
		max-width: min(590px, 100%);
		min-width: 0;
		margin-top: 9px;
		padding: 14px;
		box-sizing: border-box;
		overflow: hidden;
		border: 1px solid var(--line-strong);
		border-radius: 19px;
		background: var(--embed-surface);
		box-shadow:
			var(--shadow-md),
			inset 0 1px 0 var(--embed-inset);
		backdrop-filter: blur(20px) saturate(150%);
		-webkit-backdrop-filter: blur(20px) saturate(150%);
		transition:
			transform 0.22s var(--ease),
			box-shadow 0.22s var(--ease);
	}
	.embed-card::before {
		content: '';
		position: absolute;
		z-index: -1;
		pointer-events: none;
		top: -92px;
		right: -55px;
		width: 230px;
		height: 170px;
		border-radius: 50%;
		background: var(--embed-color);
		opacity: 0.105;
		filter: blur(48px);
	}
	/* Brilho diagonal da superfície (mesma camada do demo). */
	.embed-card::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		border-radius: inherit;
		background: linear-gradient(
			112deg,
			rgba(255, 255, 255, 0.12),
			transparent 32% 78%,
			rgba(90, 200, 250, 0.035)
		);
	}
	.embed-card:hover {
		transform: translateY(-1px);
		box-shadow:
			var(--shadow-lg),
			inset 0 1px 0 var(--embed-inset);
	}

	.embed-topline {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		margin-bottom: 11px;
	}
	.source-mark {
		display: grid;
		flex: 0 0 30px;
		width: 30px;
		height: 30px;
		place-items: center;
		border: 1px solid var(--line-strong);
		border-radius: 11px;
		color: white;
		background: color-mix(in srgb, var(--embed-color) 72%, white 8%);
		font-size: 13px;
		font-weight: 900;
	}
	.source-meta {
		min-width: 0;
		flex: 1;
	}
	.source-name {
		margin: 0;
		color: var(--text-strong);
		font-size: 12px;
		line-height: 1.25;
		font-weight: 800;
		overflow-wrap: anywhere;
	}
	.source-url {
		display: block;
		margin-top: 3px;
		color: var(--muted-soft);
		font-size: 10px;
		overflow-wrap: anywhere;
	}

	.embed-author {
		margin: 0 0 6px;
		color: var(--muted);
		font-size: 12px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.embed-author a {
		color: var(--link);
		text-decoration: none;
	}
	.embed-author a:hover {
		text-decoration: underline;
	}

	.embed-heading {
		margin: 0 0 7px;
		color: var(--text-strong);
		font-size: clamp(15px, 2.2vw, 18px);
		font-weight: 800;
		line-height: 1.27;
		letter-spacing: -0.03em;
		overflow-wrap: anywhere;
	}
	.embed-heading a {
		color: inherit;
		text-decoration: none;
	}
	.embed-heading a:hover {
		color: var(--link);
	}
	.embed-description {
		max-width: 64ch;
		margin: 0;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.55;
		overflow-wrap: anywhere;
	}

	.embed-data {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		gap: 8px;
		margin-top: 13px;
	}
	.data-chip {
		min-width: 0;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--chip);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
	}
	.data-chip:not(.inline) {
		grid-column: 1 / -1;
	}
	.data-label {
		display: block;
		margin-bottom: 4px;
		color: var(--muted-soft);
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.075em;
		text-transform: uppercase;
	}
	.data-value {
		display: block;
		color: var(--text-strong);
		font-size: 11px;
		font-weight: 750;
		overflow-wrap: anywhere;
	}

	.embed-media {
		display: grid;
		place-items: center;
		width: 100%;
		margin-top: 13px;
		overflow: hidden;
		border: 1px solid var(--line-strong);
		border-radius: 14px;
		background: var(--media-surface);
	}
	.media-play-btn {
		display: block;
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
	}
	.media-play-btn img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.media-play {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: white;
		font-size: 26px;
		line-height: 1;
		background: rgba(0, 0, 0, 0.32);
	}
	.media-iframe {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		border: 0;
		background: #0b1b2b;
	}

	.embed-video {
		display: block;
		width: 100%;
		max-height: min(70dvh, 620px);
		aspect-ratio: 16 / 9;
		object-fit: contain;
		margin-top: 13px;
		border: 1px solid var(--line-strong);
		border-radius: 14px;
		background: #000;
	}
	.embed-image {
		display: block;
		width: 100%;
		max-height: min(70dvh, 620px);
		height: auto;
		object-fit: contain;
		margin-top: 13px;
		border: 1px solid var(--line-strong);
		border-radius: 14px;
	}

	.embed-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 7px;
		margin-top: 12px;
		color: var(--muted-soft);
		font-size: 10px;
		overflow-wrap: anywhere;
	}

	/* Renderização compacta (pins/busca): card menor e texto limitado. */
	:global(.compact-message) .embed-card {
		max-width: 240px;
		padding: 8px;
		border-radius: 14px;
	}
	:global(.compact-message) .embed-description {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}

	@media (max-width: 600px) {
		.embed-card {
			margin-top: 6px;
			padding: 12px;
			border-radius: 16px;
		}
		.embed-topline {
			gap: 8px;
			margin-bottom: 9px;
		}
		.source-mark {
			flex-basis: 26px;
			width: 26px;
			height: 26px;
			border-radius: 9px;
		}
		.embed-description {
			font-size: 12px;
		}
		.embed-data {
			gap: 7px;
			margin-top: 11px;
		}
		.embed-media,
		.embed-video,
		.embed-image {
			margin-top: 11px;
		}
		.embed-footer {
			margin-top: 10px;
		}
	}
</style>

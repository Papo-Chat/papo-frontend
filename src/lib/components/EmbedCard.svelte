<script lang="ts">
	import type { Embed } from '$lib/types';
	import { getEmbed, ensureEmbed } from '$lib/store/messages.svelte';
		import {
		blobToUrl,
		embedMediaBox,
		embedVideoUrl,
		MEDIA_PRELOAD_MARGIN,
		mimeToFormat
	} from '$lib/utils/media';
	import {
		embedDirectVideoUrl,
		embedHost,
		embedIframeUrl,
		embedNeedsResolution,
		safeEmbedColor
	} from '$lib/utils/embeds';
	import { truncate } from '$lib/utils/text';
	import * as emojisStore from '$lib/store/emojis.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import { emojiUrl } from '$lib/store/emojis.svelte';
	import { openProfile } from '$lib/store/ui.svelte';
	import { WEBKIT } from '$lib/store/performance.svelte';
	import { renderMessageMarkdown } from '$lib/utils/markdown';

	let { embed } = $props<{ embed: Embed }>();
	let cardEl: HTMLElement | null = null;
	let embedFailed = $state(false);
	let lightboxOpen = $state(false);
	let lightbox: HTMLDialogElement | undefined = $state();

	$effect(() => {
		const embedId = embed.id;
		// Reage a atualizações tardias de metadata no mesmo embed.id. Um embed
		// pode chegar primeiro sem imagem e ganhar `image`/thumbnail depois via WS.
		if (!cardEl || !embedNeedsResolution(embed)) return;

		let active = true;
		const load = () =>
			void ensureEmbed(embedId).catch(() => {
				if (active) embedFailed = true;
			});
		if (!('IntersectionObserver' in window)) {
			load();
			return () => {
				active = false;
			};
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				load();
			},
			{ rootMargin: MEDIA_PRELOAD_MARGIN }
		);
		observer.observe(cardEl);
		return () => {
			active = false;
			observer.disconnect();
		};
	});

	// Embed completo (com image_data) vem do cache do store de mensagens.
	const resolved = $derived(getEmbed(embed.id));

	const imageUrl = $derived(
		resolved?.image_data
			? blobToUrl(
				resolved.image_data,
				mimeToFormat(resolved.thumbnail?.mime_type ?? resolved.image?.mime_type ?? '')
			)
			: ''
	);

	// O bitmap exibido é o blob da thumbnail do embed (handlers/embeds.go monta
	// image_data a partir de ThumbnailFilePath). As dimensões dela vêm no
	// resumo do embed, que já chega no payload da mensagem: reservar o box com
	// elas evita o salto de layout quando o base64 chega do GET /embeds/:id.
	const imageBox = $derived(embedMediaBox(embed.thumbnail) ?? embedMediaBox(embed.image));
	const imageBoxStyle = $derived(
		imageBox ? `aspect-ratio: ${imageBox.width} / ${imageBox.height}` : undefined
	);

	// Ícone do autor (author_media): substitui o selo de letra da linha de topo.
	const authorIconUrl = $derived(
		resolved?.author_image_data
			? blobToUrl(
					resolved.author_image_data,
					mimeToFormat(resolved.author?.media?.mime_type ?? 'image/png')
				)
			: ''
	);

	const title = $derived(embed.title ?? truncate(embed.url ?? '', 60));
	const hasTitle = $derived(Boolean(embed.title || embed.url));
	const host = $derived(embedHost(embed.url));
	const sourceName = $derived(embed.site_name ?? embed.provider ?? host);
	const hasTopline = $derived(Boolean(sourceName));
	const authorName = $derived(embed.author?.name ?? '');
	const authorUrl = $derived(embed.author?.url ?? '');
	// Autor repetido na linha de baixo não serve para nada: o nome já é o selo.
	const showAuthorLine = $derived(Boolean(authorName) && authorName !== (sourceName ?? ''));
	const footerText = $derived(embed.footer?.text ?? '');
	const fields = $derived(embed.fields ?? []);
	const color = $derived(safeEmbedColor(embed.color));
	const sourceInitial = $derived((sourceName || 'link').slice(0, 1).toUpperCase());

	// A descrição do card passa pelo mesmo renderizador do corpo da mensagem:
	// sem isso `:emoji:`, markdown e `@mention(<@id>)` de uma ponte aparecem crus.
	const description = $derived(embed.description ?? '');
	const mentionIds = $derived(
		[...description.matchAll(/@mention\(<@([0-9a-fA-F-]{16,})>\)/g)].map((m) => m[1])
	);
	const mentionMap = $derived(
		new Map(
			mentionIds.map((id) => {
				const u = usersStore.state.byId.get(id);
				return [id, u?.nickname || u?.username || 'usuário'] as const;
			})
		)
	);
	$effect(() => {
		if (mentionIds.length) void usersStore.ensureSummaries(mentionIds).catch(() => {});
	});
	const descriptionHtml = $derived(
		description
			? renderMessageMarkdown(description, emojisStore.state.byName, emojiUrl, {
					mentions: mentionMap
				})
			: ''
	);

	function openImageLightbox(): void {
		if (imageUrl) lightboxOpen = true;
	}

	function closeImageLightbox(): void {
		lightbox?.close();
		lightboxOpen = false;
	}

	function closeLightboxOnBackground(event: MouseEvent): void {
		if (event.target === event.currentTarget) closeImageLightbox();
	}

	$effect(() => {
		if (lightboxOpen && lightbox && !lightbox.open) lightbox.showModal();
	});

	function handleMentionClick(event: MouseEvent): void {
		const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
			'[data-mention-user-id]'
		);
		const id = target?.dataset.mentionUserId;
		if (!id) return;
		const known = usersStore.state.byId.get(id);
		if (known) {
			openProfile(known);
			return;
		}
		void usersStore
			.ensureSummary(id)
			.then((summary) => {
				if (summary) openProfile(summary);
			})
			.catch(() => {});
	}

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
	const showsVideo = $derived(!iframeUrl && videoUrl !== '' && failedVideoUrl !== videoUrl);
	// Só no WebKit: o card com vídeo direto usa CSS sem máscara/filtro (ver .has-video).
	// Os outros motores mantêm o visual completo.
	const flatVideoCard = $derived(WEBKIT && showsVideo);

	let youtubeLoaded = $state(false);
	function openYouTube(): void {
		youtubeLoaded = true;
	}

	let videoEl: HTMLVideoElement | null = $state(null);
	let videoStarted = $state(false);

	function startVideo(): void {
		if (!videoEl) return;
		videoStarted = true;
		// O elemento já existe (sem src, sem rede). src e play() ficam no mesmo
		// gesto: o iOS rejeita play() em elemento criado depois do toque.
		videoEl.src = videoUrl;
		void videoEl.play().catch(() => {});
	}
</script>

<div
	class="embed-card"
	class:has-video={flatVideoCard}
	bind:this={cardEl}
	style={color ? `--embed-color: ${color}` : undefined}
>
	{#if hasTopline}
		<header class="embed-topline">
			{#if authorIconUrl}
				<img class="source-mark source-icon" src={authorIconUrl} alt="" aria-hidden="true" />
			{:else}
				<span class="source-mark" aria-hidden="true">{sourceInitial}</span>
			{/if}
			<div class="source-meta">
				<p class="source-name">{sourceName}</p>
				{#if host}
					<span class="source-url">{host}</span>
				{/if}
			</div>
		</header>
	{/if}

	{#if showAuthorLine}
		<p class="embed-author">
			{#if authorUrl}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- URL externa do metadado do embed -->
				<a href={authorUrl} target="_blank" rel="noopener noreferrer">{authorName}</a>
			{:else}
				{authorName}
			{/if}
		</p>
	{/if}

	{#if hasTitle}
		<h3 class="embed-heading">
			{#if embed.url}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- URL externa do metadado do embed -->
				<a href={embed.url} target="_blank" rel="noopener noreferrer">{title}</a>
			{:else}
				{title}
			{/if}
		</h3>
	{/if}

	{#if embed.description}
		<!-- O clique apenas delega para os links/menções gerados pelo
		     renderizador (elementos interativos próprios, já navegáveis pelo
		     teclado); o contêiner em si não é interativo. -->
		<div class="embed-description" role="presentation" onclick={handleMentionClick}>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMessageMarkdown escapa todo texto -->
			{@html descriptionHtml}
		</div>
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
				<div class="media-preview">
					{#if imageUrl}
						<img class="media-preview-image" src={imageUrl} alt="" loading="lazy" />
					{/if}
					<button type="button" class="media-play-control" aria-label="Reproduzir vídeo" onclick={openYouTube}>
						<span class="media-play" aria-hidden="true">▶</span>
					</button>
				</div>
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
		<div class="embed-media embed-media-video">
			<video
				bind:this={videoEl}
				class="embed-video"
				poster={videoStarted ? imageUrl || undefined : undefined}
				controls={videoStarted}
				playsinline
				preload="none"
				onerror={handleVideoError}
			></video>
			{#if !videoStarted}
				<div class="media-preview media-play-overlay">
					{#if imageUrl}
						<img class="media-preview-image" src={imageUrl} alt="" loading="lazy" />
					{/if}
					<button type="button" class="media-play-control" aria-label="Reproduzir vídeo" onclick={startVideo}>
						<span class="media-play" aria-hidden="true">▶</span>
					</button>
				</div>
			{/if}
		</div>
	{:else if imageUrl || (imageBox && !embedFailed)}
		{#if imageUrl}
			<button type="button" class="embed-image-button" aria-label="Ampliar imagem do embed" onclick={openImageLightbox}>
				<img
					class="embed-image"
					src={imageUrl}
					alt="Imagem do embed"
					decoding="async"
					width={imageBox?.width}
					height={imageBox?.height}
				/>
			</button>
		{:else}
			<!-- Placeholder com a caixa exata do bitmap: um <img> sem src entraria
			     no estado "broken" e o navegador desenharia o ícone de imagem
			     quebrada antes de o base64 chegar. -->
			<span class="embed-image pending" style={imageBoxStyle} aria-hidden="true"></span>
		{/if}
	{/if}

	{#if lightboxOpen}
		<dialog
			bind:this={lightbox}
			class="embed-lightbox"
			aria-label={embed.title ?? sourceName ?? 'Imagem do embed'}
			onclick={closeLightboxOnBackground}
			oncancel={(event) => {
				event.preventDefault();
				closeImageLightbox();
			}}
		>
			<img class="embed-lightbox-image" src={imageUrl} alt="Imagem ampliada do embed" />
			<button type="button" class="embed-lightbox-close" onclick={closeImageLightbox} aria-label="Fechar">✕</button>
		</dialog>
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
		margin-top: 5px;
		position: relative;
		isolation: isolate;
		display: block;
		width: 100%;
		max-width: min(590px, 100%);
		min-width: 0;

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

	/* Card com vídeo direto. No iOS, rolar a página com um <video> iniciado dentro
	   de um card recortado (overflow + raio), isolado e com pseudo-elemento
	   filter:blur derruba a aba. Aqui o vídeo fica livre de máscara de recorte,
	   filtro, backdrop e grupo de isolamento; o raio passa a ser do próprio
	   elemento. */
	.embed-card.has-video {
		isolation: auto;
		overflow: visible;
		transition: none;
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}
	.embed-card.has-video::before,
	.embed-card.has-video::after {
		display: none;
	}
	.embed-card.has-video:hover {
		transform: none;
	}
	.embed-card.has-video .embed-media-video {
		overflow: visible;
	}
	.embed-card.has-video .embed-media-video .embed-video,
	.embed-card.has-video .media-preview-image,
	.embed-card.has-video .media-play {
		border-radius: 13px;
	}
	/* Sem overflow:hidden no card, tabelas largas do markdown precisam se conter. */
	.embed-card.has-video .embed-description :global(table) {
		display: block;
		max-width: 100%;
		overflow-x: auto;
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
	/* Ícone do autor (author_media) no lugar do selo de letra. */
	.source-icon {
		object-fit: cover;
		background: var(--chip);
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

	/* A descrição é renderizada como markdown: parágrafos do renderer não podem
	   herdar a margem padrão dentro do card. */
	.embed-description :global(p) {
		margin: 0;
	}
	.embed-description :global(.message-blank-line) {
		height: 0.55em;
	}
	.embed-description :global(a) {
		color: var(--link);
	}
	.embed-description :global(blockquote) {
		margin: 2px 0 6px;
		padding-left: 8px;
		border-left: 2px solid var(--line);
		color: var(--muted-soft);
	}
	.embed-description :global(ul),
	.embed-description :global(ol) {
		margin: 2px 0;
		padding-left: 18px;
	}
	.embed-description :global(code) {
		padding: 0.1em 0.35em;
		border-radius: 5px;
		background: var(--embed-inset);
		font-size: 12px;
	}
	.embed-description :global(pre) {
		margin: 4px 0;
		padding: 8px;
		border-radius: 8px;
		background: var(--embed-inset);
		overflow-x: auto;
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
		/* Todas as mídias deste wrapper são 16:9 (iframes, pôsteres e vídeo):
		 * limitar a largura já limita a altura a metade do chat sem cortar a
		 * proporção. */
		width: min(100%, calc(var(--chat-media-max-height, 45dvh) * 16 / 9));
		margin-inline: auto;
		margin-top: 13px;
		overflow: hidden;
		border: 1px solid var(--line-strong);
		border-radius: 14px;
		background: var(--media-surface);
	}
	.media-preview {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		background: linear-gradient(135deg, #26384a, #111923 72%);
	}
	.media-preview-image {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		pointer-events: none;
	}
	.media-play-control {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: grid;
		place-items: center;
		width: 54px;
		height: 54px;
		padding: 0 0 0 3px;
		border: 1px solid rgba(255, 255, 255, 0.7);
		border-radius: 50%;
		color: #fff;
		background: rgba(5, 12, 20, 0.76);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.32);
		backdrop-filter: blur(8px);
		cursor: pointer;
	}
	.media-play-control .media-play {
		position: static;
		display: block;
		font-size: 22px;
		line-height: 1;
		background: transparent;
	}
	.media-play-control:hover {
		background: rgba(5, 12, 20, 0.94);
	}
	.media-iframe {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		border: 0;
		background: #0b1b2b;
	}

	/* Vídeo direto: o wrapper dá borda/raio/margem; o <video> e o overlay de play
	   ocupam a mesma caixa 16:9. */
	.embed-media-video {
		position: relative;
	}
	.embed-media-video .embed-video {
		margin-top: 0;
		border: 0;
		border-radius: 0;
	}
	.media-play-overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		aspect-ratio: auto;
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
	.embed-image-button {
		display: block;
		width: 100%;
		max-width: 100%;
		margin-top: 13px;
		padding: 0;
		border: 0;
		border-radius: 14px;
		background: transparent;
		text-align: left;
		cursor: zoom-in;
	}
	.embed-image-button .embed-image {
		margin-top: 0;
	}
	.embed-image {
		display: block;
		width: 100%;
		max-height: min(620px, var(--chat-media-max-height, 45dvh));
		height: auto;
		object-fit: contain;
		border: 1px solid var(--line-strong);
		border-radius: 14px;
	}
	/* Box reservado com as dimensões vindas do resumo do embed: a área da mídia
	   já existe (com superfície) antes do base64 chegar do GET /embeds/:id,
	   então o card não empurra nada durante o scroll. */
	.embed-image.pending {
		background: var(--media-surface);
	}

	.embed-lightbox {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: transparent;
		box-sizing: border-box;
		cursor: zoom-out;
	}
	.embed-lightbox::backdrop {
		background: rgba(8, 18, 34, 0.68);
		backdrop-filter: blur(14px) saturate(1.05);
		-webkit-backdrop-filter: blur(14px) saturate(1.05);
	}
	.embed-lightbox-image {
		display: block;
		width: auto;
		height: auto;
		max-width: 90vw;
		max-height: 90vh;
		object-fit: contain;
		border-radius: 10px;
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
		cursor: default;
	}
	.embed-lightbox-close {
		position: fixed;
		top: 14px;
		right: 14px;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.4);
		color: #fff;
		font: inherit;
		font-size: 18px;
		cursor: pointer;
	}
	.embed-lightbox-close:hover {
		background: rgba(0, 0, 0, 0.6);
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
		line-clamp: 2;
	}

	@media (max-width: 600px) {
		.embed-card {
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

<script lang="ts">
	import type { MessageAttachment } from '$lib/types';
	import {
		attachmentUrl,
		attachmentThumbnailUrl,
		attachmentMediaBox,
		attachmentVideoBox,
		safeVideoMediaBox,
		fetchMediaBlob,
		MEDIA_PRELOAD_MARGIN
	} from '$lib/utils/media';
	import { formatBytes, isImageMime, isVideoMime } from '$lib/utils/text';

	let {
		attachment,
		pinned = false,
		tiled = false
	} = $props<{
		attachment: MessageAttachment;
		pinned?: boolean;
		tiled?: boolean;
	}>();

	let lightboxOpen = $state(false);
	let lightbox: HTMLDialogElement | undefined = $state();
	let downloading = $state(false);
	let downloadError = $state('');

	const thumbUrl = $derived(
		attachment.thumbnail_id !== null ? attachmentThumbnailUrl(attachment.id) : ''
	);

	const fullUrl = $derived(attachmentUrl(attachment.id));
	// `attachment` é substituído (não mutado) em updates de moderação via WS,
	// então estes valores precisam ser derivados, não constantes.
	const name = $derived(attachment.original_file_name || 'anexo');
	const mimeType = $derived(attachment.mime_type.trim().toLowerCase());
	const isImage = $derived(isImageMime(mimeType));
	const isRecordedAudioName = $derived(/^audio_.*\.(webm|ogg|wav|mp3|m4a|aac|opus)$/i.test(name));
	const isAudio = $derived(mimeType.startsWith('audio/') || isRecordedAudioName);
	// All video/* MIME values detected by the backend are playable here. For
	// historical uploads still labeled generic, keep the video UI only for
	// known video extensions instead of treating every octet-stream as video.
	const isLegacyVideoFile = $derived(/\.(mp4|m4v|mov|qt|webm|mkv|avi|3gp|3g2|ogv|mpeg|mpg|mpe|ts|mts|m2ts|flv|wmv|asf)$/i.test(name));
	const isVideo = $derived(
		isVideoMime(mimeType) || (mimeType === 'application/octet-stream' && isLegacyVideoFile)
	);

	// Imagem: o download só começa quando o box entra na margem do viewport
	// (MEDIA_PRELOAD_MARGIN), bem antes de aparecer na tela. Download e
	// decodificação acontecem fora da tela e o box já tem altura reservada
	// (dimensões da thumbnail vindas da API), então rolar não dá tranco.

	let imageBox: HTMLElement | undefined = $state();
	let imageRequested = $state(false);
	let imageShown = $state(false);

	const mediaBox = $derived(attachmentMediaBox(attachment));

	/* A caixa reservada fica no próprio botão (não num <img> sem src: esse
	   estado "broken" faz o navegador desenhar o ícone de imagem quebrada).
	   A fórmula reproduce o box final do bitmap — mesma proporção e os mesmos
	   tetos da regra do <img> — por isso entrar na tela não move nada. A
	   largura usa 100% do balão; dentro de um botão fit-content o percentual
	   resolvia a zero, então o box tem que estar no botão. */
	const mediaBoxStyle = $derived(
		mediaBox && !tiled
			? `width: min(${mediaBox.width}px, var(--image-cap-width), calc(var(--image-cap-height) * ${mediaBox.width} / ${mediaBox.height})); aspect-ratio: ${mediaBox.width} / ${mediaBox.height}`
			: undefined
	);

	$effect(() => {
		const el = imageBox;
		if (!el) return;

		if (typeof IntersectionObserver === 'undefined') {
			imageRequested = true;
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				imageRequested = true;
			},
			{ rootMargin: MEDIA_PRELOAD_MARGIN, threshold: 0 }
		);

		observer.observe(el);
		return () => observer.disconnect();
	});

	function handleImageSettled(): void {
		imageShown = true;
	}

	let audioStarted = false; // plain: não renderiza nada

	let audioEl: HTMLAudioElement | null = $state(null);
	let audioPlaying = $state(false);
	let audioCurrent = $state(0);
	let audioDuration = $state(0);
	let audioLoading = $state(false);

	function formatAudioTime(value: number): string {
		if (!Number.isFinite(value) || value < 0) return '0:00';
		const seconds = Math.floor(value);
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
	}

	function syncAudioTime(): void {
		if (!audioEl) return;
		audioCurrent = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
		const duration = audioEl.duration;
		if (Number.isFinite(duration) && duration > 0) {
			audioDuration = duration;
		}
	}

	function toggleAudio(): void {
		if (!audioEl) return;
		if (!audioStarted) {
			audioStarted = true;
			audioLoading = true;
			// src definido uma única vez e dentro do gesto: o iOS rejeita play()
			// se o elemento ainda não tinha fonte quando o toque aconteceu.
			audioEl.src = fullUrl;
		}
		if (audioEl.paused) {
			void audioEl.play().catch(() => {
				audioLoading = false;
			});
		} else {
			audioEl.pause();
		}
	}

	function seekAudio(e: Event): void {
		if (!audioEl || audioDuration <= 0) return;
		const value = Number((e.currentTarget as HTMLInputElement).value);
		audioEl.currentTime = value;
		audioCurrent = value;
	}

	async function downloadAttachment(): Promise<void> {
		if (downloading) return;
		downloading = true;
		downloadError = '';
		try {
			const blob = await fetchMediaBlob(fullUrl);
			const objectUrl = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = objectUrl;
			link.download = name;
			link.style.display = 'none';
			document.body.appendChild(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
		} catch {
			downloadError = 'Não foi possível baixar o anexo.';
		} finally {
			downloading = false;
		}
	}

	function handleAudioError(): void {
		audioStarted = false;
		audioPlaying = false;
		audioLoading = false;
		audioEl?.removeAttribute('src');
		audioEl?.load();
	}

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

	let videoEl: HTMLVideoElement | null = $state(null);
	let videoStarted = $state(false);
	let videoReady = $state(false);
	let videoMetadataAspectRatio = $state<number | null>(null);
	const videoBox = $derived(attachmentVideoBox(attachment));
	// Reserve the placeholder from the original upload's dimensions before any
	// video bytes are requested. Browser metadata is only a fallback for older
	// records that do not have stored dimensions.
	const videoAspectRatio = $derived(
		videoBox
			? videoBox.width / videoBox.height
			: (videoMetadataAspectRatio ?? 16 / 9)
	);

	function startVideo(): void {
		if (!videoEl) return;
		videoStarted = true;
		// O elemento já existe (sem src, sem rede). src e play() ficam no mesmo
		// gesto: o iOS rejeita play() em elemento criado depois do toque.
		videoEl.src = fullUrl;
		void videoEl.play().catch(() => {});
	}

	function handleVideoMetadata(): void {
		videoReady = true;
		if (videoEl) {
			const dimensions = safeVideoMediaBox(videoEl.videoWidth, videoEl.videoHeight);
			videoMetadataAspectRatio = dimensions ? dimensions.width / dimensions.height : null;
		}
	}

	function handleVideoError(): void {
		videoStarted = false;
		videoReady = false;
		videoMetadataAspectRatio = null;
		videoEl?.removeAttribute('src');
		videoEl?.load();
	}
</script>

{#if attachment.thumbnail_id !== null && isImage.isImage}
	<!-- Imagem: thumbnail inline; o clique abre o original em lightbox (in-app). -->
	<button
		type="button"
		class="attachment-image"
		class:tiled
		class:sized={!!mediaBox && !tiled}
		class:pending={!imageShown}
		style={mediaBoxStyle}
		bind:this={imageBox}
		aria-label={`Abrir ${name} em tela cheia`}
		onclick={openLightbox}
	>
		{#if imageRequested}
			<!-- Nos nao animamos gifs reprocessados, entao usamos o original.
			     Sem reserva de box: o bitmap exibido é o original e a API só
			     traz a geometria da thumbnail (128px), que daria um tamanho errado. -->
			{#if isImage.isGif}
				<img
					src={fullUrl}
					alt={name}
					decoding="async"
					class:revealed={imageShown}
					class:pinned-attachment={pinned}
					onload={handleImageSettled}
					onerror={handleImageSettled}
				/>
			{:else}
				<img
					src={thumbUrl}
					alt={name}
					width={mediaBox?.width}
					height={mediaBox?.height}
					decoding="async"
					class:revealed={imageShown}
					class:pinned-attachment={pinned}
					onload={handleImageSettled}
					onerror={handleImageSettled}
				/>
			{/if}
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

			<button type="button" class="lightbox-close" onclick={closeLightbox} aria-label="Fechar">
				✕
			</button>
		</dialog>
	{/if}
{:else if isAudio}
	<!-- Áudio: player compacto. O arquivo só é pedido no primeiro toque. -->
	<div class="attachment-media attachment-audio" class:pinned-attachment={pinned} title={name}>
		<audio
			bind:this={audioEl}
			preload="none"
			onplay={() => (audioPlaying = true)}
			onpause={() => (audioPlaying = false)}
			onended={() => {
				audioPlaying = false;
				syncAudioTime();
			}}
			onloadedmetadata={() => {
				audioLoading = false;
				syncAudioTime();
			}}
			ondurationchange={syncAudioTime}
			ontimeupdate={syncAudioTime}
			onerror={handleAudioError}
		></audio>
		<button
			class="audio-play"
			type="button"
			onclick={toggleAudio}
			aria-label={audioPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
		>
			<span aria-hidden="true">{audioPlaying ? '❚❚' : '▶'}</span>
		</button>
		<input
			class="audio-progress"
			type="range"
			min="0"
			max={audioDuration > 0 ? audioDuration : 1}
			step="0.01"
			value={audioDuration > 0 ? Math.min(audioCurrent, audioDuration) : 0}
			disabled={audioDuration <= 0}
			oninput={seekAudio}
			aria-label="Posição do áudio"
		/>
		<span class="audio-time">
			{formatAudioTime(audioCurrent)}
			<span class="audio-duration"
				>/ {audioDuration > 0 ? formatAudioTime(audioDuration) : audioLoading ? '…' : '--:--'}</span
			>
		</span>
	</div>
{:else if isVideo}
	<div class="attachment-media">
		<div
			class="attachment-video"
			class:pinned-attachment={pinned}
			style={`--video-aspect-ratio: ${videoAspectRatio}`}
		>
			<video
				bind:this={videoEl}
				poster={videoStarted ? thumbUrl || undefined : undefined}
				controls={videoStarted}
				playsinline
				preload="none"
				onloadedmetadata={handleVideoMetadata}
				onerror={handleVideoError}
			></video>
			{#if !videoStarted}
				<button
					type="button"
					class="attachment-video-overlay"
					aria-label={`Reproduzir ${name}`}
					onclick={startVideo}
				>
					{#if thumbUrl}
						<img src={thumbUrl} alt="" loading="lazy" />
					{/if}
					<span class="video-play" aria-hidden="true">▶</span>
					<span class="video-meta">
						{name}{#if attachment.size_bytes > 0}
							· {formatBytes(attachment.size_bytes)}{/if}
					</span>
				</button>
			{/if}
		</div>
	</div>
{:else}
	<!-- Arquivo: chip de download. -->
	<button
		type="button"
		class="attachment-file pill"
		class:pinned-attachment={pinned}
		disabled={downloading}
		onclick={downloadAttachment}
		aria-label={`Baixar ${name}`}
	>
		<span class="attachment-icon" aria-hidden="true">📎</span>
		<span class="attachment-name">{downloading ? 'Baixando…' : name}</span>
		{#if attachment.size_bytes > 0}
			<span class="attachment-size">{formatBytes(attachment.size_bytes)}</span>
		{/if}
	</button>
	{#if downloadError}
		<span class="attachment-error" role="alert">{downloadError}</span>
	{/if}
{/if}

<style>
	.video-play {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border: 1px solid rgba(255, 255, 255, 0.68);
		border-radius: 50%;
		background: rgba(5, 12, 20, 0.72);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.32);
		color: #fff;
		font-size: 22px;
		padding-left: 3px;
		backdrop-filter: blur(8px);
	}
	.video-meta {
		position: absolute;
		z-index: 1;
		left: 8px;
		right: 8px;
		bottom: 6px;
		overflow: hidden;
		font-size: 12px;
		color: #fff;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.attachment-image {
		display: block;
		width: fit-content;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		max-width: 100%;
		margin: 2px 0;
		cursor: zoom-in;

		/* Tetos da mídia: 360px de altura ou metade da altura visível do chat (o
		 * que for menor) e a largura do balão. Usados pela caixa reservada do
		 * botão e pelo <img>, para as duas medidas baterem. Contextos menores
		 * (mensagem compacta) sobrescrevem as duas. */
		--image-cap-width: 100%;
		--image-cap-height: min(360px, var(--chat-media-max-height, 45dvh));

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
		max-width: var(--image-cap-width);
		height: auto;
		/* Em elemento substituído com width:auto o max-height reduz a largura
		 * na mesma proporção (sem distorção e sem letterbox). */
		max-height: var(--image-cap-height);
		border-radius: 10px;

		/* Entrada suave: os pixels só aparecem depois de decodificados
		 * (o box já estava reservado, então nada se move). */
		opacity: 0;
		transition: opacity 0.24s var(--ease);
	}
	.attachment-image img.revealed {
		opacity: 1;
	}

	/* Box reservado (width/height da thumbnail vindos da API): a área da
	 * mídia existe antes do download, então a imagem não empurra o conteúdo
	 * abaixo quando entra no viewport. */
	.attachment-image.pending {
		background: var(--surface);
		border-radius: 10px;
	}

	/* Caixa reservada no próprio botão (width + aspect-ratio inline): o <img>
	 * preenche essa caixa exata, então trocar o espaço vazio pelo bitmap não
	 * move o layout. object-fit protege se o arquivo diferir 1px das dimensões
	 * declaradas (sem distorção). */
	.attachment-image.sized img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	/* Message image mosaics own the tile geometry. Fill the tile and crop
	 * like Discord instead of stacking every image at its natural aspect. */
	.attachment-image.tiled {
		width: 100%;
		height: 100%;
		margin: 0;
		overflow: hidden;
		border-radius: 10px;
	}
	.attachment-image.tiled img {
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		object-fit: cover;
		border-radius: inherit;
	}
	.attachment-media {
		display: block;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
		margin: 2px 0;
	}
	.attachment-media video {
		display: block;
		width: 100%;
		max-width: min(480px, 100%);
		max-height: calc(var(--chat-height, 100dvh) * 0.5);
		height: auto;
		border-radius: 10px;
	}
	.attachment-video {
		position: relative;
		width: min(480px, 100%, calc(var(--chat-height, 100dvh) * 0.5 * var(--video-aspect-ratio, 1.777778)));
		aspect-ratio: var(--video-aspect-ratio, 1.777778);
		box-sizing: border-box;
		overflow: hidden;
		border-radius: 10px;
		background: linear-gradient(135deg, #26384a, #111923 72%);
	}
	.attachment-video video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		background: #111923;
	}
	.attachment-video-overlay {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 10px;
		color: #fff;
		background: linear-gradient(180deg, rgba(7, 15, 25, 0.08), rgba(7, 15, 25, 0.34) 55%, rgba(7, 15, 25, 0.86));
		cursor: pointer;
	}
	.attachment-video-overlay img {
		position: absolute;
		inset: 0;
		z-index: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: inherit;
	}

	.attachment-audio {
		display: grid;
		grid-template-columns: 24px minmax(64px, 100px) auto;
		align-items: center;
		gap: 5px;
		width: min(200px, 100%);
		max-width: 200px;
		margin: 4px 0;
		padding: 4px 6px;
		border: 1px solid var(--border);
		border-radius: 9px;
		background: var(--surface);
		box-sizing: border-box;
	}

	.attachment-audio audio {
		display: none;
	}

	.audio-play {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: 8px;
		background: var(--hover);
		color: var(--text-primary);
		cursor: pointer;
		font: inherit;
		font-size: 10px;
	}

	.audio-progress {
		width: 100%;
		min-width: 64px;
		accent-color: var(--link);
	}

	.audio-time {
		font-variant-numeric: tabular-nums;
		font-size: 11px;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.audio-duration {
		color: var(--muted-soft);
	}

	.pinned-attachment {
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--gold) 78%, transparent),
			0 0 0 5px color-mix(in srgb, var(--gold) 14%, transparent);
	}

	.attachment-name {
		font-size: 12px;
		color: var(--text-secondary);
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
	.attachment-file:active:not(:disabled) {
		transform: translateY(0) scale(0.995);
	}
	.attachment-file:disabled {
		opacity: 0.68;
		cursor: wait;
		transform: none;
	}
	.attachment-error {
		display: block;
		margin: 2px 0 0 6px;
		font-size: 11px;
		color: var(--danger);
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

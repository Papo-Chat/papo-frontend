<script lang="ts">
	import type { MessageAttachment } from '$lib/types';
	import { attachmentUrl, attachmentThumbnailUrl, fetchMediaBlob } from '$lib/utils/media';
	import { formatBytes, isImageMime } from '$lib/utils/text';

	let { attachment, pinned = false, tiled = false, grouped = true } = $props<{
		attachment: MessageAttachment;
		pinned?: boolean;
		tiled?: boolean;
		grouped?:boolean;
	}>();

	let lightboxOpen = $state(false);
	let lightbox: HTMLDialogElement | undefined = $state();
	let downloading = $state(false);
	let downloadError = $state('');

	const thumbUrl = $derived(
		attachment.thumbnail_id !== null ? attachmentThumbnailUrl(attachment.id) : ''
	);

	const fullUrl = $derived(attachmentUrl(attachment.id));
	const name = attachment.original_file_name || 'anexo';
	const isImage = isImageMime(attachment.mime_type);
	const isRecordedAudioName = /^audio_.*\.(webm|ogg|wav|mp3|m4a|aac|opus)$/i.test(name);
	const isAudio = attachment.mime_type.startsWith('audio/') || isRecordedAudioName;

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

	function startVideo(): void {
		if (!videoEl) return;
		videoStarted = true;
		// O elemento já existe (sem src, sem rede). src e play() ficam no mesmo
		// gesto: o iOS rejeita play() em elemento criado depois do toque.
		videoEl.src = fullUrl;
		void videoEl.play().catch(() => {});
	}

	function handleVideoError(): void {
		videoStarted = false;
		videoReady = false;
		videoEl?.removeAttribute('src');
		videoEl?.load();
	}
</script>

{#if (attachment.thumbnail_id !== null && isImage.isImage)}
	<!-- Imagem: thumbnail inline; o clique abre o original em lightbox (in-app). -->
	<button
		type="button"
		class="attachment-image {grouped ? 'bubblegrouped': ''}"
		class:tiled
		aria-label={`Abrir ${name} em tela cheia`}
		onclick={openLightbox}
	>
		<!-- Nos nao animamos gifs reprocessados, entao usamos o original -->
		{#if isImage.isGif}
			<img src={fullUrl} alt={name} loading="lazy" class:pinned-attachment={pinned} />
		{:else}
			<img src={thumbUrl} alt={name} loading="lazy" class:pinned-attachment={pinned} />
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
{:else if isAudio}
	<!-- Áudio: player compacto. O arquivo só é pedido no primeiro toque. -->
	<div class="attachment-media attachment-audio {!grouped ? 'bubblegrouped': ''}" class:pinned-attachment={pinned} title={name}>
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
		<button class="audio-play" type="button" onclick={toggleAudio} aria-label={audioPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}>
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
			<span class="audio-duration">/ {audioDuration > 0 ? formatAudioTime(audioDuration) : (audioLoading ? '…' : '--:--')}</span>
		</span>
	</div>
{:else if attachment.mime_type.startsWith('video/') || attachment.mime_type.startsWith('application/octet-stream')}
	<div class="attachment-media {!grouped ? 'bubblegrouped': ''}">
		<div class="attachment-video" class:pinned-attachment={pinned}>
			<video
				bind:this={videoEl}
				class:unsized={!videoReady}
				poster={videoStarted ? thumbUrl || undefined : undefined}
				controls={videoStarted}
				playsinline
				preload="none"
				onloadedmetadata={() => (videoReady = true)}
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
						{name}{#if attachment.size_bytes > 0} · {formatBytes(attachment.size_bytes)}{/if}
					</span>
				</button>
			{/if}
		</div>
	</div>
{:else}
	<!-- Arquivo: chip de download. -->
	<button
		type="button"
		class="attachment-file pill {!grouped ? 'bubblegrouped': ''}"
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
		font-size: 28px;
	}
	.video-meta {
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: 6px;
		overflow: hidden;
		font-size: 12px;
		color: var(--text-secondary);
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
		height: auto;
		max-height: 360px;
		border-radius: 10px;
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
		height: auto;
		border-radius: 10px;
	}
	.attachment-video {
		position: relative;
		width: 100%;
		max-width: min(480px, 100%);
		border-radius: 10px;
	}
	.attachment-video video {
		max-width: 100%;
		background: var(--surface);
	}
	/* Sem metadados o <video> não tem proporção; reserva 16:9 até carregar. */
	.attachment-video video.unsized {
		aspect-ratio: 16 / 9;
	}
	.attachment-video-overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: transparent;
		cursor: pointer;
	}
	.attachment-video-overlay img {
		position: absolute;
		inset: 0;
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

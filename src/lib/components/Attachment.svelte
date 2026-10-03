<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { MessageAttachment } from '$lib/types';
	import { attachmentUrl, attachmentThumbnailUrl, fetchMediaBlob } from '$lib/utils/media';
	import { formatBytes, isImageMime } from '$lib/utils/text';

	let { attachment, pinned = false, tiled = false } = $props<{
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
	const name = attachment.original_file_name || 'anexo';
	const isImage = isImageMime(attachment.mime_type);
	const isRecordedAudioName = /^audio_.*\.(webm|ogg|wav|mp3|m4a|aac|opus)$/i.test(name);
	const isAudio = attachment.mime_type.startsWith('audio/') || isRecordedAudioName;
	const SMALL_AUDIO_MAX = 2 * 1024 * 1024;

	let audioEl: HTMLAudioElement | null = $state(null);
	let audioSrc = $state('');
	let audioObjectUrl = '';
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
		if (audioEl.paused) {
			void audioEl.play();
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

	$effect(() => {
		if (!isAudio) return;
		audioSrc = fullUrl;

		if (attachment.size_bytes <= 0 || attachment.size_bytes > SMALL_AUDIO_MAX) {
			return;
		}

		const controller = new AbortController();
		audioLoading = true;
		void fetchMediaBlob(fullUrl, controller.signal)
			.then((blob) => {
				if (controller.signal.aborted) return;
				if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
				audioObjectUrl = URL.createObjectURL(blob);
				audioSrc = audioObjectUrl;
			})
			.catch(() => {
				if (!controller.signal.aborted) audioSrc = fullUrl;
			})
			.finally(() => {
				if (!controller.signal.aborted) audioLoading = false;
			});

		return () => controller.abort();
	});

	onDestroy(() => {
		if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
	});

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
	<!-- Áudio: player compacto. Áudios pequenos são baixados inteiros para
	     blob local, evitando Range/206 e metadados de duração instáveis. -->
	<div class="attachment-media attachment-audio" class:pinned-attachment={pinned} title={name}>
		<audio
			bind:this={audioEl}
			src={audioSrc || fullUrl}
			preload="metadata"
			onplay={() => (audioPlaying = true)}
			onpause={() => (audioPlaying = false)}
			onended={() => {
				audioPlaying = false;
				syncAudioTime();
			}}
			onloadedmetadata={syncAudioTime}
			ondurationchange={syncAudioTime}
			ontimeupdate={syncAudioTime}
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
	<!-- Vídeo: player inline. Binários genéricos seguem para o download abaixo. -->
	<div class="attachment-media">
		<video src={fullUrl} controls preload="metadata" class:pinned-attachment={pinned}></video>
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

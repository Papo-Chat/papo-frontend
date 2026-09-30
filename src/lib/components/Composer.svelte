<script lang="ts">
	import type { MessageWithAttachment } from '$lib/types';
	import type { EmojiOption } from '$lib/utils/emojis';
	import { send as wsSend } from '../ws';
	import { throttle } from '$lib/utils/throttle';
	import * as usersStore from '$lib/store/users.svelte';
	import Icon from './Icon.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import Avatar from './Avatar.svelte';
	import { onDestroy } from 'svelte';

	let {
		onSend,
		onReplyCancel,
		channelId,
		replyTo,
		disabled = false
	} = $props<{
		onSend?: (
			text: string | null,
			files?: File[],
			onProgress?: (percent: number) => void
		) => Promise<void>;
		onReplyCancel?: () => void;
		channelId?: string | null;
		replyTo?: MessageWithAttachment | null;
		disabled?: boolean;
	}>();

	const MAX_ATTACHMENTS = 10;
	const MAX_LINES = 5;

	let text = $state('');
	let error: string | null = $state(null);
	let sending = $state(false);
	let emojiOpen = $state(false);
	let mobileActionsOpen = $state(false);

	let inputEl: HTMLTextAreaElement | null = null;
	let fileInput: HTMLInputElement | null = null;

	let files = $state<File[]>([]);
	let progress = $state(0);

	// ── gravação de áudio (microfone) ──
	let recording = $state(false);
	let stopping = $state(false);
	let recorder: MediaRecorder | null = null;
	let stream: MediaStream | null = null;
	let chunks: BlobPart[] = [];

	const replyAuthor = $derived(
		usersStore.state.byId.get(replyTo?.author_id ?? '')
	);

	const replyToAuthorName = $derived(
		replyAuthor?.nickname || replyAuthor?.username || ''
	);

	function onFilesSelected(e: Event): void {
		const el = e.target as HTMLInputElement;
		const selected = Array.from(el.files ?? []);
		const available = MAX_ATTACHMENTS - files.length;

		if (available <= 0) {
			error = `Máximo de ${MAX_ATTACHMENTS} anexos por mensagem.`;
			el.value = '';
			return;
		}

		files = [...files, ...selected.slice(0, available)];

		if (selected.length > available) {
			error = `Máximo de ${MAX_ATTACHMENTS} anexos por mensagem.`;
		} else {
			error = null;
		}

		el.value = '';
	}

	function removeFile(index: number): void {
		if (sending) return;

		files = files.filter((_, i) => i !== index);
	}

	// Typing signal (WS).
	const sendTypingSignal = throttle(() => {
		if (channelId && text.length > 0) {
			wsSend({
				type: 'typing',
				channel_id: channelId
			});
		}
	}, 750);

	function notifyTyping(): void {
		sendTypingSignal();
	}

	/**
	 * Ajusta o textarea automaticamente.
	 *
	 * 1 até 5 linhas:
	 * - abaixo de 5 linhas: cresce automaticamente
	 * - acima de 5 linhas: mantém altura e usa scroll interno
	 */
	function resizeInput(): void {
		if (!inputEl) return;

		inputEl.style.height = 'auto';

		const style = getComputedStyle(inputEl);

		const lineHeight =
			Number.parseFloat(style.lineHeight) || 20;

		const paddingTop =
			Number.parseFloat(style.paddingTop) || 0;

		const paddingBottom =
			Number.parseFloat(style.paddingBottom) || 0;

		const borderTop =
			Number.parseFloat(style.borderTopWidth) || 0;

		const borderBottom =
			Number.parseFloat(style.borderBottomWidth) || 0;

		const maxHeight =
			lineHeight * MAX_LINES +
			paddingTop +
			paddingBottom +
			borderTop +
			borderBottom;

		const newHeight = Math.min(
			inputEl.scrollHeight,
			maxHeight
		);

		inputEl.style.height = `${newHeight}px`;

		inputEl.style.overflowY =
			inputEl.scrollHeight > maxHeight
				? 'auto'
				: 'hidden';
	}

	function resetInputHeight(): void {
		queueMicrotask(() => {
			if (!inputEl) return;

			inputEl.style.height = 'auto';
			inputEl.style.overflowY = 'hidden';

			resizeInput();
		});
	}

	function send(): void {
		if (recording) {
			return;
		}

		const t = text.trim();

		if ((!t && files.length === 0) || disabled || sending) {
			return;
		}

		error = null;
		sending = true;
		progress = 0;

		onSend?.(
			t || null,
			files,
			(percent: number) => {
				progress = percent;
			}
		)
			.then(() => {
				text = '';
				files = [];
				emojiOpen = false;
				mobileActionsOpen = false;

				resetInputHeight();
			})
			.catch((err: unknown) => {
				error =
					err instanceof Error
						? err.message
						: 'Erro ao enviar a mensagem.';
			})
			.finally(() => {
				sending = false;
			});
	}

	function onInput(e: Event): void {
		const el = e.target as HTMLTextAreaElement;

		text = el.value;

		resizeInput();
		notifyTyping();
	}

	function onKeydown(e: KeyboardEvent): void {
		// Enter envia.
		// Shift + Enter é deixado para o textarea criar uma nova linha.
		if (
			e.key === 'Enter' &&
			!e.shiftKey &&
			!e.isComposing
		) {
			e.preventDefault();
			send();
		}
	}

	function toggleEmoji(): void {
		if (!disabled) {
			emojiOpen = !emojiOpen;
		}
	}

	function toggleMobileActions(): void {
		if (disabled) return;

		mobileActionsOpen = !mobileActionsOpen;

		if (!mobileActionsOpen) {
			emojiOpen = false;
		}
	}

	function toggleMobileEmoji(): void {
		if (disabled) return;

		emojiOpen = !emojiOpen;
		mobileActionsOpen = true;
	}

	function onPickEmoji(emoji: EmojiOption): void {
		const char =
			emoji.kind === 'unicode'
				? emoji.char
				: `:${emoji.name}:`;

		const el = inputEl;

		const start = el?.selectionStart ?? text.length;
		const end = el?.selectionEnd ?? text.length;

		text =
			text.slice(0, start) +
			char +
			text.slice(end);

		queueMicrotask(() => {
			if (!inputEl) return;

			const cursor = start + char.length;

			inputEl.selectionStart = cursor;
			inputEl.selectionEnd = cursor;

			resizeInput();

			inputEl.focus();
			notifyTyping();
		});
	}

	function cancelReply(): void {
		onReplyCancel?.();
	}

	function openFilePicker(): void {
		mobileActionsOpen = false;
		emojiOpen = false;

		fileInput?.click();
	}

	// ── gravação de áudio (microfone) ──

	const canCaptureAudio =
		typeof navigator !== 'undefined' &&
		typeof navigator.mediaDevices.getUserMedia === 'function';

	function audioRecordingName(mime: string): string {
		const now = new Date();
		const p = (n: number) => String(n).padStart(2, '0');
		const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(
			now.getDate()
		)}_${p(now.getHours())}${p(now.getMinutes())}${p(
			now.getSeconds()
		)}`;

		return `audio_${stamp}.${mime.includes('ogg') ? 'ogg' : 'webm'}`;
	}

	function cancelRecording(): void {
		chunks = [];
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
		}
		stream = null;
		recorder = null;
		recording = false;
		stopping = false;
	}

	function startRecording(): void {
		if (recording || stopping) {
			return;
		}
		error = null;

		if (!canCaptureAudio) {
			error = 'Gravação de áudio não suportada neste navegador.';
			return;
		}

		navigator.mediaDevices
			.getUserMedia({ audio: true })
			.then((s) => {
				if (recording || stopping) {
					// A gravação foi interrompida antes de começar; libere o track.
					s.getTracks().forEach((t) => t.stop());
					return;
				}

				const rec = new MediaRecorder(s);
				rec.ondataavailable = (e) => {
					if (e.data.size > 0) {
						chunks.push(e.data);
					}
				};
				rec.onerror = () => {
					cancelRecording();
					error = 'Erro na gravação de áudio.';
				};

				stream = s;
				chunks = [];
				try {
					rec.start(1000);
				} catch {
					cancelRecording();
					error = 'Não foi possível iniciar a gravação.';
					return;
				}

				recorder = rec;
				recording = true;
			})
			.catch(() => {
				// getUserMedia rejeitou (permissão negada ou sem suporte).
				error =
					'Permissão de microfone negada. Ative a permissão do navegador e tente de novo.';
			});
	}

	function stopRecording(): void {
		if (!recording || !recorder || stopping) {
			return;
		}

		const rec = recorder;
		stopping = true;

		const onstop = () => {
			stopping = false;
			recording = false;
			recorder = null;

			const type = rec.mimeType || 'audio/webm';
			const blob = new Blob(chunks, { type });
			chunks = [];

			if (stream) {
				stream.getTracks().forEach((t) => t.stop());
			}
			stream = null;

			if (blob.size === 0) {
				error = 'Gravação vazia. Tente novamente.';
				return;
			}

			const available = MAX_ATTACHMENTS - files.length;
			if (available <= 0) {
				error = `Máximo de ${MAX_ATTACHMENTS} anexos por mensagem.`;
				return;
			}

			files = [
				...files,
				new File([blob], audioRecordingName(type), { type })
			];
		};

		rec.onstop = onstop;
		rec.stop();
	}

	function toggleRecording(): void {
		if (recording) {
			stopRecording();
		} else {
			startRecording();
		}
	}

	onDestroy(() => {
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
		}
		stream = null;
		recorder = null;
	});
</script>

<div class="composer-area">
	{#if replyTo}
		<div class="composer-reply">
			<Icon
				name="arrow-bend-up-left"
				variant="light"
			/>

			<Avatar
				user={replyAuthor}
				size={20}
			/>

			<span class="reply-name">
				{replyToAuthorName}
			</span>

			<span class="reply-text">
				{#if replyTo.content}
					{replyTo.content.length > 120
						? replyTo.content.slice(0, 120) + '...'
						: replyTo.content}
				{:else}
					<i>Anexo</i>
				{/if}
			</span>

			<button
				class="reply-cancel"
				onclick={cancelReply}
				aria-label="Cancelar resposta"
			>
				<Icon
					name="x"
					variant="light"
				/>
			</button>
		</div>
	{/if}

	{#if error}
		<div
			class="send-error"
			role="alert"
		>
			<Icon
				name="warning-circle"
				variant="light"
			/>

			<span>{error}</span>
		</div>
	{/if}

	{#if files.length}
		<div
			class="composer-files"
			aria-label="Arquivos anexados"
		>
			{#each files as f, index (f.name + f.size + index)}
				<span class="composer-file">
					<span
						class="composer-file-name"
						title={f.name}
					>
						{f.name}
					</span>

					{#if sending}
						<span
							class="composer-file-progress"
							aria-hidden="true"
						>
							<span
								class="composer-file-bar"
								style="width: {progress}%"
							></span>
						</span>
					{/if}

					<button
						type="button"
						class="composer-file-remove"
						aria-label={`Remover ${f.name}`}
						title="Remover anexo"
						onclick={() => removeFile(index)}
						disabled={sending}
					>
						<Icon
							name="x"
							variant="light"
						/>
					</button>
				</span>
			{/each}
		</div>
	{/if}

	<footer class="composer">
		<div class="composer-tools-desktop">
			<button
				class="composer-tool"
				title="Anexo"
				aria-label="Anexo"
				{disabled}
				onclick={openFilePicker}
			>
				<Icon
					name="paperclip"
					variant="light"
				/>
			</button>

			<button
				class="composer-tool mic-tool"
				class:recording={recording}
				title={recording ? 'Parar gravação' : 'Gravar áudio'}
				aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}
				{disabled}
				onclick={toggleRecording}
			>
				<Icon
					name="microphone"
					variant="light"
				/>
			</button>

			<button
				class="composer-tool emoji-btn"
				title="Emojis"
				aria-label="Emojis"
				onclick={toggleEmoji}
				{disabled}
			>
				<Icon
					name="smiley"
					variant="light"
				/>

				<EmojiPicker
					bind:open={emojiOpen}
					onPick={onPickEmoji}
				/>
			</button>
		</div>

		<div
			class="mobile-actions"
			class:open={mobileActionsOpen}
		>
			<div
				class="mobile-action-menu"
				aria-hidden={!mobileActionsOpen}
			>
				<button
					class="composer-tool mobile-action emoji-btn"
					title="Emojis"
					aria-label="Emojis"
					tabindex={mobileActionsOpen ? 0 : -1}
					onclick={toggleMobileEmoji}
					{disabled}
				>
					<Icon
						name="smiley"
						variant="light"
					/>

					<EmojiPicker
						bind:open={emojiOpen}
						onPick={onPickEmoji}
					/>
				</button>

				<button
					class="composer-tool mobile-action mic-tool"
					class:recording={recording}
					title={recording ? 'Parar gravação' : 'Gravar áudio'}
					aria-label={recording ? 'Parar gravação' : 'Gravar áudio'}
					tabindex={mobileActionsOpen ? 0 : -1}
					onclick={toggleRecording}
					{disabled}
				>
					<Icon
						name="microphone"
						variant="light"
					/>
				</button>

				<button
					class="composer-tool mobile-action"
					title="Anexo"
					aria-label="Anexo"
					tabindex={mobileActionsOpen ? 0 : -1}
					onclick={openFilePicker}
					{disabled}
				>
					<Icon
						name="paperclip"
						variant="light"
					/>
				</button>
			</div>

			<button
				class="composer-tool mobile-actions-trigger"
				title={mobileActionsOpen ? 'Fechar ações' : 'Mais ações'}
				aria-label={mobileActionsOpen ? 'Fechar ações' : 'Mais ações'}
				aria-expanded={mobileActionsOpen}
				onclick={toggleMobileActions}
				{disabled}
			>
				<span
					class="mobile-actions-glyph"
					aria-hidden="true"
				>
					<Icon
						name="plus"
						variant="light"
					/>
				</span>
			</button>
		</div>

        <div class="input">
            <textarea
                class="composer-input"
                bind:this={inputEl}
                bind:value={text}
                rows="1"
                placeholder="Digite sua mensagem..."
                aria-label="Digite sua mensagem"
                {disabled}
                oninput={onInput}
                onkeydown={onKeydown}
            ></textarea>
        </div>

		<input
			type="file"
			multiple
			accept="image/*,video/*,audio/*,application/pdf"
			aria-label="Selecionar arquivos para anexar"
			class="composer-file-input"
			bind:this={fileInput}
			onchange={onFilesSelected}
		/>

		<button
			class="send"
			onclick={send}
			disabled={
				disabled ||
				recording ||
				text.trim() === '' && files.length === 0
			}
		>
			Enviar
		</button>
	</footer>
</div>

<style>
	button.composer-tool {
		font: inherit;
		-webkit-appearance: none;
		appearance: none;
	}

	button.composer-tool i {
		font-size: 18px;
		line-height: 1;
	}

	button.send {
		font: inherit;
		-webkit-appearance: none;
		appearance: none;
	}

	.composer-tool.emoji-btn {
		position: relative;
	}

	.send-error {
		display: flex;
		align-items: center;
		gap: 6px;

		padding: 8px 14px;

		border: 1px solid rgba(220, 40, 40, 0.5);
		border-radius: 14px;

		background: rgba(220, 40, 40, 0.1);

		font-size: 13px;
		color: #b91c1c;
	}

	.composer-reply {
		display: flex;
		align-items: flex-start;
		gap: 8px;

		padding: 9px 14px;

		border: 1px solid rgba(255, 255, 255, 0.7);
		border-radius: 18px;

		background:
			radial-gradient(
				circle at 12% -60%,
				rgba(255, 255, 255, 0.6),
				transparent 58%
			),
			linear-gradient(
				145deg,
				rgba(250, 253, 255, 0.54),
				rgba(208, 235, 248, 0.32)
			);

		backdrop-filter: blur(16px) saturate(150%);
		-webkit-backdrop-filter: blur(16px) saturate(150%);

		font-size: 13px;
		color: var(--text);

		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.9),
			0 10px 20px rgba(22, 72, 108, 0.08);
	}

	.reply-name {
		font-weight: 700;
	}

	.reply-text {
		color: var(--muted-soft);

		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.reply-cancel {
		margin-left: auto;

		display: flex;
		align-items: center;
		justify-content: center;

		width: 24px;
		height: 24px;

		border-radius: 8px;
		border: none;

		background: none;

		cursor: pointer;
		color: var(--muted-soft);
	}

	.composer-file-input {
		position: absolute;

		width: 1px;
		height: 1px;

		padding: 0;
		margin: -1px;

		overflow: hidden;
		clip: rect(0 0 0 0);

		white-space: nowrap;
		border: 0;
	}

	.composer-files {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;

		padding: 0 14px;
	}

	.composer-file {
		display: inline-flex;
		align-items: center;
		gap: 8px;

		min-width: 120px;
		max-width: 240px;

		padding: 6px 10px;

		border: 1px solid rgba(255, 255, 255, 0.7);
		border-radius: 10px;

		background: var(--glass-soft);

		font-size: 12.5px;
		color: var(--text);
	}

	.composer-file-name {
		flex: 1;

		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.composer-file-progress {
		display: inline-block;

		flex: 0 0 70px;

		height: 3px;

		border-radius: 2px;

		background: rgba(20, 40, 70, 0.22);

		overflow: hidden;
	}

	.composer-file-bar {
		display: block;

		height: 100%;

		background: var(--link);
	}

	.composer-file-remove {
		flex: 0 0 auto;

		display: flex;
		align-items: center;
		justify-content: center;

		width: 20px;
		height: 20px;

		padding: 0;

		border: 0;
		border-radius: 6px;

		background: transparent;
		color: var(--muted-soft);

		cursor: pointer;
	}

	.composer-file-remove:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.08);
	}

	.composer-file-remove:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.composer-tools-desktop {
		display: contents;
	}

	.mobile-actions {
		display: none;
	}

	@media (max-width: 768px) {
		.composer {
			display: flex;
			align-items: center;

			width: 100%;
			gap: 8px;
		}

		.composer-tools-desktop {
			display: none;
		}

		.mobile-actions {
			position: relative;
			z-index: 4;

			display: block;

			flex: 0 0 auto;
		}

		button.composer-tool.mobile-actions-trigger,
		button.composer-tool.mobile-action {
			background: linear-gradient(
				145deg,
				rgb(255, 255, 255),
				rgba(223, 241, 250)
			);

			border-color: #d3e1e9;

			box-shadow: none;

			backdrop-filter: none;
			-webkit-backdrop-filter: none;
		}

		button.composer-tool.mobile-actions-trigger:hover,
		button.composer-tool.mobile-action:hover {
			background: #e9f3f8;
			box-shadow: none;
		}

		.mobile-action-menu {
			position: absolute;

			left: 0;
			bottom: calc(100% + 8px);

			display: flex;
			flex-direction: column;
			gap: 8px;

			pointer-events: none;
		}

		.mobile-action {
			opacity: 0;

			transform: translateY(14px) scale(0.88);
			transform-origin: center bottom;

			pointer-events: none;

			transition:
				opacity 160ms ease,
				transform 220ms
					cubic-bezier(0.2, 0.9, 0.25, 1.15);
		}

		.mobile-actions.open .mobile-action-menu {
			pointer-events: auto;
		}

		.mobile-actions.open .mobile-action {
			opacity: 1;

			transform: translateY(0) scale(1);

			pointer-events: auto;
		}

		.mobile-actions.open .mobile-action:nth-child(3) {
			transition-delay: 0ms;
		}

		.mobile-actions.open .mobile-action:nth-child(2) {
			transition-delay: 45ms;
		}

		.mobile-actions.open .mobile-action:nth-child(1) {
			transition-delay: 90ms;
		}

		.mobile-actions-trigger {
			position: relative;
			z-index: 2;
		}

		.mobile-actions-glyph {
			display: grid;
			place-items: center;

			transform: rotate(0deg);

			transition:
				transform 220ms
					cubic-bezier(0.2, 0.9, 0.25, 1.15);
		}

		.mobile-actions.open .mobile-actions-glyph {
			transform: rotate(45deg);
		}

		.input {
			flex: 1 1 auto;

			width: auto;
			min-width: 80px;
			max-width: none;
		}
        
        .composer-input {
            display: block;
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
        }

		.send {
			flex: 0 0 auto;
		}
	}

	:global([data-theme='dark'])
		button.composer-tool.mobile-actions-trigger,
	:global([data-theme='dark'])
		button.composer-tool.mobile-action {
		background: linear-gradient(
			145deg,
			rgb(61, 84, 99),
			rgba(24, 48, 63)
		);

		border-color: #405866;

		box-shadow: none;
	}

	:global([data-theme='dark'])
		button.composer-tool.mobile-actions-trigger:hover,
	:global([data-theme='dark'])
		button.composer-tool.mobile-action:hover {
		background: #2f4553;
		box-shadow: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.mobile-action,
		.mobile-actions-glyph {
			transition: none;
		}
	}

    .composer-input {
        min-width: 0;
        width: 100%;
        flex: 1;

        margin: 0;
        padding: 0;

        border: 0;
        outline: 0;
        resize: none;

        background: transparent;
        color: var(--text);

        font: inherit;
        font-size: 16px;
        line-height: 1.4;

        box-sizing: border-box;

        overflow-x: hidden;
        overflow-y: hidden;

        white-space: pre-wrap;
        overflow-wrap: anywhere;

        scrollbar-width: thin;
        scrollbar-color: rgba(72, 130, 170, 0.28) transparent;
    }

    .composer-input::placeholder {
        color: var(--muted-soft);
    }

    .composer-input::-webkit-scrollbar {
        width: 8px;
    }

    .composer-input::-webkit-scrollbar-thumb {
        background: rgba(72, 130, 170, 0.22);
        border-radius: 999px;
        border: 2px solid transparent;
        background-clip: padding-box;
    }

    .composer-input:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

	/* ── gravação de microfone ──────────────────────────────
	     Estado de gravação do botão de microfone. Especificidade
	     maior que .mobile-action e seus :hover (incluindo os
	     variantes de tema escuro) para o fundo vermelho
	     prevalecer em desktop, mobile e qualquer tema. */
	button.composer-tool.mic-tool.recording {
		background: linear-gradient(145deg, #ff96ab, #ff5a71);
		border-color: #ff5a71;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.55),
			0 6px 14px rgba(255, 90, 113, 0.45);
	}
	button.composer-tool.mic-tool.recording:hover,
	button.composer-tool.mic-tool.recording:active {
		background: linear-gradient(145deg, #ff96ab, #ff5a71);
	}
	button.composer-tool.mic-tool.recording i {
		color: #fff;
		filter: none;
		animation: mic-pulse 1.2s ease-in-out infinite;
	}
	@keyframes mic-pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.15);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		button.composer-tool.mic-tool.recording i {
			animation: none;
		}
	}
</style>
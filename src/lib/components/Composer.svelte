<script module lang="ts">
	const channelDrafts = new Map<string, string>();
</script>

<script lang="ts">
	import type { MessageWithAttachment } from '$lib/types';
	import { allEmojis, emojiText, type EmojiOption } from '$lib/utils/emojis';
	import { formatToMime } from '$lib/utils/media';
	import { send as wsSend } from '../ws';
	import { throttle } from '$lib/utils/throttle';
	import * as usersStore from '$lib/store/users.svelte';
	import * as rolesStore from '$lib/store/roles.svelte';
	import { state as sessionState } from '$lib/store/session.svelte';
	import { state as serverState } from '$lib/store/server.svelte';
	import Icon from './Icon.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import Avatar from './Avatar.svelte';
	import FormattedMessage from './FormattedMessage.svelte';
	import { onDestroy } from 'svelte';

	let {
		onSend,
		onReplyCancel,
		channelId,
		replyTo,
		disabled = false,
		allowAttachments = null
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
		allowAttachments?: boolean | null;
	}>();

	const MAX_ATTACHMENTS = 10;
	const MAX_LINES = 5;

	let text = $state('');
	let draftChannelId = $state<string | null>(null);
	let error: string | null = $state(null);
	let sending = $state(false);
	let desktopEmojiOpen = $state(false);
	let mobileEmojiOpen = $state(false);
	let mobileActionsOpen = $state(false);

	let inputEl: HTMLTextAreaElement | null = null;
	let fileInput: HTMLInputElement | null = null;

	let files = $state<File[]>([]);
	let progress = $state(0);
	type MentionOption = {
		kind: 'user' | 'everyone';
		id: string;
		label: string;
		username: string;
	};
	const selectedMentions = new Map<string, string>();
	let mentionOpen = $state(false);
	let mentionStart = $state(-1);
	let mentionQuery = $state('');
	let mentionIndex = $state(0);
	let emojiAutocompleteOpen = $state(false);
	let emojiAutocompleteStart = $state(-1);
	let emojiAutocompleteQuery = $state('');
	let emojiAutocompleteIndex = $state(0);
	const emojiCatalog = $derived(allEmojis());

	const myRoleIds = $derived(new Set(sessionState.roles.map((r) => r.id)));
	const myRoles = $derived(rolesStore.state.list.filter((r) => myRoleIds.has(r.id)));
	const permissionContext = $derived({
		roles: myRoles,
		isOwner: !!sessionState.userId && serverState.server?.owner_id === sessionState.userId
	});
	const canMentionEveryone = $derived(rolesStore.can('everyone_message', permissionContext));
	const canSendAttachment = $derived(
		allowAttachments ?? rolesStore.can('send_attachment', permissionContext)
	);

	function mentionOptions(): MentionOption[] {
		if (!mentionOpen) return [];
		const q = mentionQuery.toLowerCase();
		const out: MentionOption[] = [];

		if (canMentionEveryone && 'everyone'.startsWith(q)) {
			out.push({ kind: 'everyone', id: 'everyone', label: 'everyone', username: 'everyone' });
		}

		for (const u of [...usersStore.state.byId.values()]
			.filter((u) => {
				const display = (u.nickname || u.username).toLowerCase();
				return display.includes(q) || u.username.toLowerCase().includes(q);
			})
			.slice(0, 8 - out.length)) {
			out.push({
				kind: 'user',
				id: u.id,
				label: u.nickname || u.username,
				username: u.username
			});
		}
		return out;
	}

	const mentionItems = $derived(mentionOptions());

	function closeMentions(): void {
		mentionOpen = false;
		mentionStart = -1;
		mentionQuery = '';
		mentionIndex = 0;
	}

	function refreshMentions(): void {
		const cursor = inputEl?.selectionStart ?? text.length;
		const before = text.slice(0, cursor);
		const m = before.match(/(?:^|\s)@([^\s@()]*)$/);
		if (!m) {
			closeMentions();
			return;
		}
		mentionStart = before.length - m[1].length - 1;
		mentionQuery = m[1];
		mentionOpen = true;
		mentionIndex = 0;
	}

	function serializeMentions(value: string): string {
		let serialized = value;
		for (const [username, userId] of selectedMentions) {
			serialized = serialized.replaceAll(`@${username}`, `@mention(<@${userId}>)`);
		}
		return serialized;
	}

	function insertMention(option: MentionOption): void {
		if (mentionStart < 0) return;
		const cursor = inputEl?.selectionStart ?? text.length;
		const readable = `@${option.username} `;

		if (option.kind === 'user') {
			selectedMentions.set(option.username, option.id);
		}

		text = text.slice(0, mentionStart) + readable + text.slice(cursor);
		if (channelId) channelDrafts.set(channelId, text);
		const next = mentionStart + readable.length;
		closeMentions();

		queueMicrotask(() => {
			if (!inputEl) return;
			inputEl.selectionStart = next;
			inputEl.selectionEnd = next;
			inputEl.focus();
			resizeInput();
			notifyTyping();
		});
	}


	function emojiAutocompleteOptions(): EmojiOption[] {
		if (!emojiAutocompleteOpen) return [];
		const query = emojiAutocompleteQuery.toLowerCase();
		return emojiCatalog
			.filter((option) => {
				const name = option.kind === 'unicode' ? option.label : option.name;
				return name.toLowerCase().startsWith(query);
			})
			.slice(0, 8);
	}

	const emojiAutocompleteItems = $derived(emojiAutocompleteOptions());

	function closeEmojiAutocomplete(): void {
		emojiAutocompleteOpen = false;
		emojiAutocompleteStart = -1;
		emojiAutocompleteQuery = '';
		emojiAutocompleteIndex = 0;
	}

	function refreshEmojiAutocomplete(): void {
		const cursor = inputEl?.selectionStart ?? text.length;
		const before = text.slice(0, cursor);
		const match = before.match(/(?:^|\\s):([^\\s:()]*)$/);
		if (!match) {
			closeEmojiAutocomplete();
			return;
		}
		emojiAutocompleteStart = before.length - match[1].length - 1;
		emojiAutocompleteQuery = match[1];
		emojiAutocompleteOpen = true;
		emojiAutocompleteIndex = 0;
	}

	function insertEmojiAutocomplete(option: EmojiOption): void {
		if (emojiAutocompleteStart < 0) return;
		const cursor = inputEl?.selectionStart ?? text.length;
		const value = emojiText(option);
		text = text.slice(0, emojiAutocompleteStart) + value + text.slice(cursor);
		if (channelId) channelDrafts.set(channelId, text);
		const next = emojiAutocompleteStart + value.length;
		closeEmojiAutocomplete();

		queueMicrotask(() => {
			if (!inputEl) return;
			inputEl.selectionStart = next;
			inputEl.selectionEnd = next;
			inputEl.focus();
			resizeInput();
			notifyTyping();
		});
	}

	function emojiAutocompleteImage(option: Extract<EmojiOption, { kind: 'custom' }>): string {
		if (!option.image_blob) return '';
		return `data:${formatToMime(option.format)};base64,${option.image_blob}`;
	}

	// ── gravação de áudio (microfone) ──
	let recording = $state(false);
	let draggingFiles = $state(false);
	let stopping = $state(false);
	let recorder: MediaRecorder | null = null;
	let stream: MediaStream | null = null;
	let chunks: BlobPart[] = [];
	let recordingElapsed = $state(0);
	let recordingStartedAt = 0;
	let recordingTimer: ReturnType<typeof setInterval> | null = null;

	const replyAuthor = $derived(
		usersStore.state.byId.get(replyTo?.author_id ?? '')
	);

	const replyToAuthorName = $derived(
		replyAuthor?.nickname || replyAuthor?.username || ''
	);

	function addFiles(selected: File[]): void {
		if (!canSendAttachment || selected.length === 0) return;

		const available = MAX_ATTACHMENTS - files.length;
		if (available <= 0) {
			error = `Máximo de ${MAX_ATTACHMENTS} anexos por mensagem.`;
			return;
		}

		files = [...files, ...selected.slice(0, available)];
		error =
			selected.length > available
				? `Máximo de ${MAX_ATTACHMENTS} anexos por mensagem.`
				: null;
	}

	function onFilesSelected(e: Event): void {
		const el = e.currentTarget as HTMLInputElement;
		addFiles(Array.from(el.files ?? []));
		el.value = '';
	}

	function hasDraggedFiles(data: DataTransfer | null): boolean {
		return !!data && Array.from(data.types).includes('Files');
	}

	function onDragEnter(e: DragEvent): void {
		if (!hasDraggedFiles(e.dataTransfer)) return;
		e.preventDefault();
		if (canSendAttachment) draggingFiles = true;
	}

	function onDragOver(e: DragEvent): void {
		if (!hasDraggedFiles(e.dataTransfer)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = canSendAttachment ? 'copy' : 'none';
		if (canSendAttachment) draggingFiles = true;
	}

	function onDragLeave(e: DragEvent): void {
		const next = e.relatedTarget as Node | null;
		if (next && (e.currentTarget as HTMLElement).contains(next)) return;
		draggingFiles = false;
	}

	function onDrop(e: DragEvent): void {
		draggingFiles = false;
		if (!hasDraggedFiles(e.dataTransfer)) return;
		e.preventDefault();
		if (!canSendAttachment) return;
		addFiles(Array.from(e.dataTransfer?.files ?? []));
	}

	function onPaste(e: ClipboardEvent): void {
		if (!canSendAttachment) return;
		const direct = Array.from(e.clipboardData?.files ?? []);
		const fromItems = Array.from(e.clipboardData?.items ?? [])
			.filter((item) => item.kind === 'file')
			.map((item) => item.getAsFile())
			.filter((file): file is File => file !== null);
		const pasted = direct.length ? direct : fromItems;
		if (pasted.length === 0) return;
		e.preventDefault();
		addFiles(pasted);
	}

	function removeFile(index: number): void {
		if (sending) return;

		files = files.filter((_, i) => i !== index);
	}

	$effect(() => {
		if (!error) return;
		const current = error;
		const timer = setTimeout(() => {
			if (error === current) error = null;
		}, 4500);
		return () => clearTimeout(timer);
	});

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

	$effect(() => {
		const nextChannel = channelId ?? null;
		if (nextChannel === draftChannelId) return;
		if (draftChannelId) channelDrafts.set(draftChannelId, text);
		draftChannelId = nextChannel;
		text = nextChannel ? (channelDrafts.get(nextChannel) ?? '') : '';
		closeMentions();
		closeEmojiAutocomplete();
		resetInputHeight();
	});

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
		const wireText = t ? serializeMentions(t) : '';

		if ((!t && files.length === 0) || disabled || sending) {
			return;
		}

		error = null;
		sending = true;
		progress = 0;

		onSend?.(
			wireText || null,
			files,
			(percent: number) => {
				progress = percent;
			}
		)
			.then(() => {
				text = '';
				if (channelId) channelDrafts.delete(channelId);
				files = [];
				selectedMentions.clear();
				desktopEmojiOpen = false;
				mobileEmojiOpen = false;
				mobileActionsOpen = false;
				closeMentions();
				closeEmojiAutocomplete();

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
		if (channelId) channelDrafts.set(channelId, text);

		resizeInput();
		refreshMentions();
		refreshEmojiAutocomplete();
		notifyTyping();
	}

	function onKeydown(e: KeyboardEvent): void {
		if (mentionOpen && mentionItems.length) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				mentionIndex = (mentionIndex + 1) % mentionItems.length;
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				mentionIndex = (mentionIndex - 1 + mentionItems.length) % mentionItems.length;
				return;
			}
			if ((e.key === 'Enter' || e.key === 'Tab') && !e.isComposing) {
				e.preventDefault();
				insertMention(mentionItems[mentionIndex] ?? mentionItems[0]);
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				closeMentions();
				return;
			}
		}

		if (emojiAutocompleteOpen && emojiAutocompleteItems.length) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				emojiAutocompleteIndex =
					(emojiAutocompleteIndex + 1) % emojiAutocompleteItems.length;
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				emojiAutocompleteIndex =
					(emojiAutocompleteIndex - 1 + emojiAutocompleteItems.length) %
					emojiAutocompleteItems.length;
				return;
			}
			if ((e.key === 'Enter' || e.key === 'Tab') && !e.isComposing) {
				e.preventDefault();
				insertEmojiAutocomplete(
					emojiAutocompleteItems[emojiAutocompleteIndex] ?? emojiAutocompleteItems[0]
				);
				return;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				closeEmojiAutocomplete();
				return;
			}
		}
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
			desktopEmojiOpen = !desktopEmojiOpen;
			mobileEmojiOpen = false;
		}
	}

	function toggleMobileActions(): void {
		if (disabled) return;

		mobileActionsOpen = !mobileActionsOpen;

		if (!mobileActionsOpen) {
			mobileEmojiOpen = false;
		}
	}

	function toggleMobileEmoji(): void {
		if (disabled) return;

		mobileEmojiOpen = !mobileEmojiOpen;
		desktopEmojiOpen = false;
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
		if (channelId) channelDrafts.set(channelId, text);

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

	async function onPickGif(gif: { id: string }): Promise<void> {
		if (disabled || sending || !gif.id) return;
		error = null;
		sending = true;
		try {
			await onSend?.(`giphy:${gif.id}`);
			desktopEmojiOpen = false;
			mobileEmojiOpen = false;
			mobileActionsOpen = false;
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Não foi possível enviar o GIF.';
		} finally {
			sending = false;
		}
	}

	function cancelReply(): void {
		onReplyCancel?.();
	}

	function openFilePicker(): void {
		if (!canSendAttachment) return;
		mobileActionsOpen = false;
		desktopEmojiOpen = false;
		mobileEmojiOpen = false;

		fileInput?.click();
	}

	// ── gravação de áudio (microfone) ──

	const canCaptureAudio =
		typeof navigator !== 'undefined' &&
		!!navigator.mediaDevices &&
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

	function clearRecordingTimer(): void {
		if (recordingTimer) {
			clearInterval(recordingTimer);
			recordingTimer = null;
		}
	}

	function formatRecordingTime(ms: number): string {
		const total = Math.floor(ms / 1000);
		return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
	}

	function cleanupRecording(): void {
		clearRecordingTimer();
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
		}
		stream = null;
		recorder = null;
		recording = false;
		stopping = false;
		recordingStartedAt = 0;
		recordingElapsed = 0;
	}

	function cancelRecording(): void {
		const rec = recorder;
		chunks = [];
		if (rec && rec.state !== 'inactive') {
			rec.onstop = () => {
				chunks = [];
				cleanupRecording();
			};
			try {
				rec.stop();
				return;
			} catch {
				// fall through to local cleanup
			}
		}
		cleanupRecording();
	}

	function startRecording(): void {
		if (!canSendAttachment || recording || stopping) {
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
				recordingStartedAt = Date.now();
				recordingElapsed = 0;
				clearRecordingTimer();
				recordingTimer = setInterval(() => {
					recordingElapsed = Date.now() - recordingStartedAt;
				}, 250);
				mobileActionsOpen = false;
			})
			.catch(() => {
				// getUserMedia rejeitou (permissão negada ou sem suporte).
				error =
					'Permissão de microfone negada. Ative a permissão do navegador e tente de novo.';
			});
	}

	function sendRecording(): void {
		if (!recording || !recorder || stopping || sending) {
			return;
		}

		const rec = recorder;
		stopping = true;
		clearRecordingTimer();

		rec.onstop = () => {
			const type = rec.mimeType || 'audio/webm';
			const blob = new Blob(chunks, { type });
			chunks = [];
			cleanupRecording();

			if (blob.size === 0) {
				error = 'Gravação vazia. Tente novamente.';
				return;
			}

			const file = new File([blob], audioRecordingName(type), { type });
			error = null;
			sending = true;
			progress = 0;

			Promise.resolve(
				onSend?.(null, [file], (percent: number) => {
					progress = percent;
				})
			)
				.then(() => {
					desktopEmojiOpen = false;
				mobileEmojiOpen = false;
					mobileActionsOpen = false;
				})
				.catch((err: unknown) => {
					// Keep the recording as a normal attachment if direct send fails.
					files = [...files, file];
					error = err instanceof Error ? err.message : 'Erro ao enviar a gravação.';
				})
				.finally(() => {
					sending = false;
				});
		};

		try {
			rec.stop();
		} catch {
			stopping = false;
			error = 'Não foi possível finalizar a gravação.';
		}
	}

	onDestroy(() => {
		clearRecordingTimer();
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
		}
		stream = null;
		recorder = null;
	});
</script>

<div
	class="composer-area"
	class:dragging-files={draggingFiles}
	ondragenter={onDragEnter}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
>
	{#if draggingFiles && canSendAttachment}
		<div class="attachment-drop-overlay" aria-hidden="true">
			<Icon name="paperclip" variant="duotone" size={22} />
			<span>Solte para anexar</span>
		</div>
	{/if}

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

			<div class="reply-text">
				{#if replyTo.content}
					<FormattedMessage content={replyTo.content} />
				{:else}
					<i>Anexo</i>
				{/if}
			</div>

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

	<footer class="composer" class:no-attachments={!canSendAttachment}>
		{#if recording || stopping}
			<div class="audio-recorder" aria-live="polite">
				<span class="recording-status">
					<span class="recording-dot" aria-hidden="true"></span>
					<span class="recording-time">{formatRecordingTime(recordingElapsed)}</span>
				</span>
				<span class="recording-label">{stopping ? 'Finalizando…' : 'Gravando áudio'}</span>
				<button
					class="recording-btn cancel"
					type="button"
					onclick={cancelRecording}
					disabled={stopping || sending}
				>
					<Icon name="trash" variant="light" size={15} />
					Cancelar
				</button>
				<button
					class="recording-btn send-recording"
					type="button"
					onclick={sendRecording}
					disabled={stopping || sending}
				>
					<Icon name="paper-plane-tilt" variant="light" size={15} />
					Enviar
				</button>
			</div>
		{:else}
		<div class="composer-tools-desktop">
			{#if canSendAttachment}
				<button
					class="composer-tool"
					title="Anexo"
					aria-label="Anexo"
					{disabled}
					onclick={openFilePicker}
				>
					<Icon name="paperclip" variant="light" />
				</button>

				<button
					class="composer-tool mic-tool"
					class:recording={recording}
					title="Gravar áudio"
					aria-label="Gravar áudio"
					{disabled}
					onclick={startRecording}
				>
					<Icon name="microphone" variant="light" />
				</button>
			{/if}

			<div class="emoji-btn-wrap">
				<button
					class="composer-tool emoji-btn"
					title="Emojis e GIFs"
					aria-label="Emojis e GIFs"
					onclick={toggleEmoji}
					{disabled}
				>
					<Icon
						name="smiley"
						variant="light"
					/>
				</button>

				<EmojiPicker
					bind:open={desktopEmojiOpen}
					onPick={onPickEmoji}
					enableGifs
					onPickGif={onPickGif}
				/>
			</div>
		</div>

		<div
			class="mobile-actions"
			class:open={mobileActionsOpen}
		>
			<div
				class="mobile-action-menu"
				aria-hidden={!mobileActionsOpen}
			>
				<div class="mobile-action emoji-mobile-wrap">
					<button
						class="composer-tool emoji-btn"
						title="Emojis e GIFs"
						aria-label="Emojis e GIFs"
						tabindex={mobileActionsOpen ? 0 : -1}
						onclick={toggleMobileEmoji}
						{disabled}
					>
						<Icon
							name="smiley"
							variant="light"
						/>
					</button>

					<EmojiPicker
						bind:open={mobileEmojiOpen}
						onPick={onPickEmoji}
						enableGifs
						onPickGif={onPickGif}
					/>
				</div>

				{#if canSendAttachment}
					<button
						class="composer-tool mobile-action mic-tool"
						class:recording={recording}
						title="Gravar áudio"
						aria-label="Gravar áudio"
						tabindex={mobileActionsOpen ? 0 : -1}
						onclick={startRecording}
						{disabled}
					>
						<Icon name="microphone" variant="light" />
					</button>

					<button
						class="composer-tool mobile-action"
						title="Anexo"
						aria-label="Anexo"
						tabindex={mobileActionsOpen ? 0 : -1}
						onclick={openFilePicker}
						{disabled}
					>
						<Icon name="paperclip" variant="light" />
					</button>
				{/if}
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
			{#if mentionOpen && mentionItems.length}
				<div class="mention-menu" role="listbox">
					{#each mentionItems as option, index (option.kind + option.id)}
						<button
							type="button"
							class:active={index === mentionIndex}
							onmousedown={(e) => e.preventDefault()}
							onclick={() => insertMention(option)}
						>
							{#if option.kind === 'user'}
								<Avatar user={usersStore.state.byId.get(option.id)} size={24} />
								<span class="mention-option-copy">
									<strong>{option.label}</strong>
									<small>@{option.username}</small>
								</span>
							{:else}
								<span class="mention-everyone-icon">@</span>
								<span class="mention-option-copy">
									<strong>@everyone</strong>
									<small>Mencionar todos</small>
								</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
			{#if emojiAutocompleteOpen && emojiAutocompleteItems.length}
				<div class="mention-menu" role="listbox" aria-label="Sugestões de emoji">
					{#each emojiAutocompleteItems as option, index (option.kind === 'unicode' ? option.char : option.id)}
						<button
							type="button"
							class:active={index === emojiAutocompleteIndex}
							aria-selected={index === emojiAutocompleteIndex}
							onmousedown={(e) => e.preventDefault()}
							onclick={() => insertEmojiAutocomplete(option)}
						>
							{#if option.kind === 'unicode'}
								<span class="emoji-autocomplete-icon">{option.char}</span>
								<span class="mention-option-copy">
									<strong>:{option.label}:</strong>
									<small>Emoji</small>
								</span>
							{:else}
								<span class="emoji-autocomplete-icon custom">
									{#if option.image_blob}
										<img src={emojiAutocompleteImage(option)} alt="" />
									{:else}
										:
									{/if}
								</span>
								<span class="mention-option-copy">
									<strong>:{option.name}:</strong>
									<small>Emoji personalizado</small>
								</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
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
				onpaste={onPaste}
            ></textarea>
        </div>

		{#if canSendAttachment}
		<input
			type="file"
			multiple
			accept="image/*,video/*,audio/*,application/pdf"
			aria-label="Selecionar arquivos para anexar"
			class="composer-file-input"
			bind:this={fileInput}
			onchange={onFilesSelected}
		/>
		{/if}

		<button
			class="send"
			onclick={send}
			disabled={
				disabled ||
				text.trim() === '' && files.length === 0
			}
		>
			Enviar
		</button>
		{/if}
	</footer>
</div>

<style>
	.composer-area {
		position: relative;
	}

	.attachment-drop-overlay {
		position: absolute;
		inset: 0 8px;
		z-index: 40;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 2px dashed color-mix(in srgb, var(--accent) 60%, var(--border));
		border-radius: 16px;
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 750;
		pointer-events: none;
	}

	:global([data-theme='dark']) .attachment-drop-overlay {
		background: rgba(13, 34, 48, 0.94);
		border-color: rgba(108, 204, 250, 0.5);
	}

	:global(html[data-ui-flat]) .attachment-drop-overlay {
		background: var(--surface);
		box-shadow: none;
	}

	.audio-recorder {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 7px 5px 10px;
	}

	.recording-status {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		flex: 0 0 auto;
		height: 30px;
		padding: 0 9px;
		border-radius: 9px;
		background: rgba(255, 90, 113, 0.12);
		border: 1px solid rgba(255, 90, 113, 0.24);
	}

	.recording-dot {
		width: 8px;
		height: 8px;
		flex: 0 0 auto;
		border-radius: 50%;
		background: #ff5a71;
		box-shadow: 0 0 0 4px rgba(255, 90, 113, 0.12);
		animation: mic-pulse 1.2s ease-in-out infinite;
	}

	.recording-time {
		font-size: 12px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
	}

	.recording-label {
		flex: 1;
		min-width: 0;
		font-size: 12px;
		color: var(--muted-soft);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.recording-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		height: 30px;
		padding: 0 9px;
		border-radius: 9px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-primary);
		font: inherit;
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
	}

	.recording-btn.cancel:hover {
		color: #d6423e;
		background: rgba(214, 66, 62, 0.09);
	}

	.recording-btn.send-recording {
		color: #fff;
		border-color: rgba(10, 115, 214, 0.45);
		background: linear-gradient(180deg, #54aaf2, #0a73d6);
	}

	.recording-btn:disabled {
		opacity: 0.55;
		cursor: wait;
	}

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

	.emoji-btn-wrap,
	.emoji-mobile-wrap {
		position: relative;
		display: inline-flex;
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
		flex: 1 1 auto;
		min-width: 0;
		max-height: 3.1em;
		overflow: hidden;
		color: var(--muted-soft);
		overflow-wrap: anywhere;
	}

	:global(.reply-text .msg-text) {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}

	:global([data-theme='dark']) .composer-reply {
		border-color: rgba(184, 225, 249, 0.14);
		background: linear-gradient(145deg, rgba(42, 65, 80, 0.94), rgba(14, 38, 53, 0.94));
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
		color: var(--text-primary);
	}

	:global(html[data-ui-flat]) .composer-reply {
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		background: var(--surface);
		box-shadow: none;
		border-color: var(--border);
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
		.audio-recorder {
			width: 100%;
			padding-left: 9px;
		}
		.recording-label {
			display: none;
		}
		.recording-btn {
			padding-inline: 8px;
		}

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
	.input {
		position: relative;
	}

	.mention-menu {
		position: absolute;
		left: 0;
		bottom: calc(100% + 8px);
		z-index: 70;
		display: flex;
		flex-direction: column;
		gap: 3px;
		width: min(340px, 82vw);
		max-height: 270px;
		overflow: auto;
		padding: 6px;
		border: 1px solid rgba(126, 178, 211, 0.42);
		border-radius: 14px;
		background: linear-gradient(145deg, rgba(251, 254, 255, 0.99), rgba(229, 244, 252, 0.985));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.95),
			0 14px 34px rgba(14, 62, 94, 0.22);
	}

	.mention-menu button {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		min-height: 42px;
		padding: 6px 9px;
		border: 1px solid transparent;
		border-radius: 10px;
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.mention-menu button:hover,
	.mention-menu button.active {
		border-color: rgba(99, 174, 220, 0.2);
		background: rgba(102, 193, 243, 0.16);
	}

	.emoji-autocomplete-icon {
		display: grid;
		width: 24px;
		height: 24px;
		flex: 0 0 24px;
		place-items: center;
		font-size: 20px;
		line-height: 1;
	}

	.emoji-autocomplete-icon.custom img {
		display: block;
		width: 22px;
		height: 22px;
		object-fit: contain;
	}

	.mention-option-copy {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 1px;
	}

	.mention-option-copy strong {
		overflow: hidden;
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 750;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mention-option-copy small {
		color: var(--muted-soft);
		font-size: 11px;
		font-weight: 500;
	}

	.mention-everyone-icon {
		display: grid;
		width: 24px;
		height: 24px;
		flex: 0 0 24px;
		place-items: center;
		border-radius: 50%;
		background: rgba(39, 151, 220, 0.15);
		color: var(--link);
		font-weight: 800;
	}

	:global(html[data-theme='dark']) .mention-menu {
		border-color: rgba(156, 210, 242, 0.18);
		background: linear-gradient(145deg, rgba(31, 59, 77, 0.995), rgba(10, 34, 49, 0.995));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.08),
			0 14px 34px rgba(0, 0, 0, 0.38);
	}

	:global(html[data-theme='dark']) .mention-menu button:hover,
	:global(html[data-theme='dark']) .mention-menu button.active {
		border-color: rgba(122, 201, 245, 0.15);
		background: rgba(89, 181, 232, 0.16);
	}

	:global(html[data-ui-flat]) .mention-menu {
		background: #eef8fd;
		box-shadow: 0 7px 18px rgba(20, 73, 106, 0.14);
	}

	:global(html[data-ui-flat][data-theme='dark']) .mention-menu {
		background: #153447;
		box-shadow: 0 7px 18px rgba(0, 0, 0, 0.28);
	}
</style>
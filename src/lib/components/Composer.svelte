<script lang="ts">
	import type { MessageWithAttachment } from '$lib/types';
	import type { EmojiOption } from '$lib/utils/emojis';
	import { send as wsSend } from '../ws';
	import { throttle } from '$lib/utils/throttle';
	import * as usersStore from '$lib/store/users.svelte';
	import Icon from './Icon.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import Avatar from './Avatar.svelte';

	let {
		onSend,
		onReplyCancel,
		channelId,
		replyTo,
		disabled = false
	} = $props<{
		onSend?: (text: string) => Promise<void>;
		onReplyCancel?: () => void;
		channelId?: string | null;
		replyTo?: MessageWithAttachment | null;
		disabled?: boolean;
	}>();

	let text = $state('');
	let error: string | null = $state(null);
	let sending = $state(false);
	let emojiOpen = $state(false);
	let inputEl: HTMLInputElement | null = null;

	const replyAuthor = $derived(usersStore.state.byId.get(replyTo?.author_id ?? ''));
	const replyToAuthorName = $derived(replyAuthor?.nickname || replyAuthor?.username || '');

	// Typing signal (WS). O cliente envia `WsTypingInbound`
	// (`{type:'typing', channel_id}`) enquanto digita; o servidor trata o
	// "stop" via inatividade e faz o broadcast (`WsTyping`) para os demais.
	// Throttle para não spamer o servidor em digitação rápida.
	const sendTypingSignal = throttle(() => {
		if (channelId && text.length > 0) {
			wsSend({ type: 'typing', channel_id: channelId });
		}
	}, 750);

	function notifyTyping(): void {
		sendTypingSignal();
	}

	function send(): void {
		const t = text.trim();
		if (!t || disabled || sending) return;
		error = null;
		sending = true;
		onSend?.(t).then(() => {
			text = '';
			emojiOpen = false;
			notifyTyping();
		}).catch((err: unknown) => {
			error = err instanceof Error ? err.message : 'Erro ao enviar a mensagem.';
		})
		.finally(() => {
			sending = false;
		});
	}

	function onInput(e: Event): void {
		const el = e.target as HTMLInputElement;
		text = el.value;
		notifyTyping();
	}

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	function toggleEmoji(): void {
		if (!disabled) {
			emojiOpen = !emojiOpen;
		}
	}

	function onPickEmoji(emoji: EmojiOption): void {
		const char = emoji.kind === 'unicode' ? emoji.char : emoji.name;
		const el = inputEl;
		const start = el?.selectionStart ?? 0;
		const end = el?.selectionEnd ?? 0;
		text = text.slice(0, start) + char + text.slice(end);
		queueMicrotask(() => {
			if (inputEl) {
				inputEl.selectionStart = start + char.length;
				inputEl.selectionEnd = start + char.length;
				inputEl.focus();
				notifyTyping();
			}
		});
	}

	function cancelReply(): void {
		onReplyCancel?.();
	}
</script>

<div class="composer-area">
	{#if replyTo}
		<div class="composer-reply">
			<Icon name="arrow-bend-up-left" variant="light" />
			<Avatar user={replyAuthor} size={20}/>
			<span class="reply-name">{replyToAuthorName}</span>
			<span class="reply-text">{replyTo.content ?? ''}</span>
			<button class="reply-cancel" onclick={cancelReply} aria-label="Cancelar resposta">
				<Icon name="x" variant="light" />
			</button>
		</div>
	{/if}

	{#if error}
		<div class="send-error" role="alert">
			<Icon name="warning-circle" variant="light" />
			<span>{error}</span>
		</div>
	{/if}

	<footer class="composer">
		<button
			class="composer-tool"
			title="Anexo"
			aria-label="Anexo"
			disabled={disabled}
		>
			<Icon name="paperclip" variant="light" />
		</button>
		<button
			class="composer-tool"
			title="Microfone"
			aria-label="Microfone"
			disabled={disabled}
		>
			<Icon name="microphone" variant="light" />
		</button>
		<button
			class="composer-tool emoji-btn"
			title="Emojis"
			aria-label="Emojis"
			onclick={toggleEmoji}
			disabled={disabled}
		>
			<Icon name="smiley" variant="light" />
			<EmojiPicker bind:open={emojiOpen} onPick={onPickEmoji} />
		</button>

		<div class="input">
			<input
				type="text"
				bind:this={inputEl}
				bind:value={text}
				placeholder="Digite sua mensagem..."
				aria-label="Digite sua mensagem"
				disabled={disabled}
				oninput={onInput}
				onkeydown={onKeydown}
			/>
		</div>

		<button class="send" onclick={send} disabled={disabled || text.trim() === ''}>
			Enviar
		</button>
	</footer>
</div>

<style>
	/* Reset default button styling so the aero.css styles apply. */
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

	/* Reply preview: glass box stacked above the composer, only when replying. */
	.composer-area {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
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
	.send-error i {
		font-size: 15px;
	}

	.composer-reply {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 9px 14px;
		border: 1px solid rgba(255, 255, 255, 0.7);
		border-radius: 18px;
		background:
			radial-gradient(circle at 12% -60%, rgba(255, 255, 255, 0.6), transparent 58%),
			linear-gradient(145deg, rgba(250, 253, 255, 0.54), rgba(208, 235, 248, 0.32));
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
</style>

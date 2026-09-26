<script lang="ts">
	import type { EmojiOption } from '$lib/utils/emojis';
	import Icon from './Icon.svelte';
	import EmojiPicker from './EmojiPicker.svelte';

	let { onSend } = $props<{ onSend?: (text: string) => void }>();

	let text = $state('');
	let emojiOpen = $state(false);
	let inputEl: HTMLInputElement | null = null;

	function send(): void {
		const t = text.trim();
		if (!t) return;
		onSend?.(t);
		text = '';
	}

	function onInput(e: Event): void {
		const el = e.target as HTMLInputElement;
		text = el.value;
	}

	function onKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	function toggleEmoji(): void {
		emojiOpen = !emojiOpen;
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
			}
		});
	}
</script>

<footer class="composer">
	<button class="composer-tool" title="Anexo" aria-label="Anexo">
		<Icon name="paperclip" variant="light" />
	</button>
	<button class="composer-tool" title="Microfone" aria-label="Microfone">
		<Icon name="microphone" variant="light" />
	</button>
	<button
		class="composer-tool emoji-btn"
		title="Emojis"
		aria-label="Emojis"
		onclick={() => toggleEmoji()}
	>
		<Icon name="smiley" variant="light" />
		<EmojiPicker bind:open={emojiOpen} onPick={onPickEmoji} />
	</button>

	<div class="input">
		<input
			type="text"
			placeholder="Digite sua mensagem..."
			bind:this={inputEl}
			bind:value={text}
			oninput={onInput}
			onkeydown={onKeydown}
			aria-label="Digite sua mensagem"
		/>
	</div>

	<button class="send" onclick={send}>Enviar</button>
</footer>

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
	.composer-tool.emoji-btn {
		position: relative;
	}
</style>

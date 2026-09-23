<script lang="ts">
	import Icon from './Icon.svelte';

	let { onSend } = $props<{ onSend?: (text: string) => void }>();

	let text = $state('');

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
</script>

<footer class="composer">
	<button class="composer-tool" title="Anexo" aria-label="Anexo">
		<Icon name="paperclip" variant="light" />
	</button>
	<button class="composer-tool" title="Microfone" aria-label="Microfone">
		<Icon name="microphone" variant="light" />
	</button>
	<button class="composer-tool" title="Imagem" aria-label="Imagem">
		<Icon name="image" variant="light" />
	</button>

	<div class="input">
		<input
			type="text"
			placeholder="Digite sua mensagem..."
			bind:value={text}
			oninput={onInput}
			onkeydown={onKeydown}
			aria-label="Digite sua mensagem"
		/>
	</div>

	<button class="send" onclick={send}>Enviar</button>
</footer>

<style>
	button.composer-tool{
		font: inherit;
		-webkit-appearance: none;
		appearance: none;
	}
	button.composer-tool i{
		font-size: 18px;
		line-height: 1;
	}
</style>

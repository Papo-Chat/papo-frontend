<script lang="ts">
	import * as emojisStore from '$lib/store/emojis.svelte';
	import { emojiUrl } from '$lib/store/emojis.svelte';
	import type { Emoji } from '$lib/types';

	let { content } = $props<{ content: string }>();

	type Token = { kind: 'text'; value: string } | { kind: 'emoji'; name: string; emoji: Emoji };

	// Tokeniza o conteúdo em trechos de texto + emojis `:name:` conhecidos.
	// Nomes desconhecidos permanecem literais (ex.: `:x:`). Função pura.
	function tokenize(content: string, nameMap: Map<string, Emoji>): {tokens:Token[]; hasText:boolean}{
		const re = /:([A-Za-z0-9_]+):/g;
		const tokens: Token[] = [];
		let last = 0;
		let m: RegExpExecArray | null;
		let hasText = false;
		while ((m = re.exec(content)) !== null) {
			const start = m.index;
			if (start > last) {
				tokens.push({ kind: 'text', value: content.slice(last, start) });
				hasText = true;
			}
			const name = m[1];
			const emoji = nameMap.get(name);
			if (emoji) {
				tokens.push({ kind: 'emoji', name, emoji });
			} else {
				tokens.push({ kind: 'text', value: m[0] });
			}
			last = m.index + m[0].length;
		}
		if (last < content.length) {
			tokens.push({ kind: 'text', value: content.slice(last) });
			hasText = true;
		}
		return {tokens, hasText};
	}

	// Mapeia o nome do emoji (listados) -> emoji carregado. Best-effort:
	// apenas os emojis já carregados (paginação lazy) são resolvidos.
	const nameMap = $derived(new Map<string, Emoji>(emojisStore.state.list.map((e) => [e.name, e])));

	const {tokens, hasText} = $derived(tokenize(content, nameMap));

	// Chave única por token (índice + tipo): força recriação quando o tipo
	// muda (ex.: texto -> emoji quando o emoji é carregado).
	function tokenKey(i: number, t: Token): string {
		return `${i}:${t.kind}`;
	}
</script>

<p class="msg-text">
	{#each tokens as t, i (tokenKey(i, t))}
		{#if t.kind === 'emoji'}
			{#if emojiUrl(t.emoji)}
				{#if hasText}
					<img class="inline-emoji" src={emojiUrl(t.emoji)} alt={t.name} aria-hidden="true" />
				{:else}
					<img class="full-emoji" src={emojiUrl(t.emoji)} alt={t.name} aria-hidden="true" />
				{/if}
			{:else}
				<span>{`:${t.name}:`}</span>
			{/if}
		{:else}
			{t.value}
		{/if}
	{/each}
</p>

<style>
	.msg-text {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.inline-emoji {
		display: inline;
		width: 1.6em;
		height: 1.6em;
		vertical-align: baseline;
		margin: 0 1px;
		border-radius: 4px;
	}
	.full-emoji {
		display: inline;
		width: 3em;
		height: 3em;
		vertical-align: baseline;
		margin: 0 1px;
		border-radius: 4px;
	}
</style>

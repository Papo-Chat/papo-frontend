<script lang="ts">
	// Versão compacta do FormattedMessage para espaços de uma linha (preview
	// de reply no cabeçalho da mensagem): markdown inline (negrito, itálico,
	// código), emojis custom pequenos e mentions como texto estilizado.
	// Sem mídia e sem elementos interativos: o contêiner do preview já é um
	// botão e não pode aninhar controles.
	import * as emojisStore from '$lib/store/emojis.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import { emojiUrl } from '$lib/store/emojis.svelte';
	import { renderMessageMarkdown } from '$lib/utils/markdown';

	let { content } = $props<{ content: string }>();

	let el: HTMLSpanElement | null = null;

	const nameMap = $derived(emojisStore.state.byName);

	const mentionIds = $derived(
		[...(content ?? '').matchAll(/@mention\(<@([0-9a-fA-F-]{16,})>\)/g)].map((m) => m[1])
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

	const html = $derived(
		renderMessageMarkdown(content ?? '', nameMap, emojiUrl, {
			mentions: mentionMap,
			highlightEveryone: false,
			light: true
		})
	);

	$effect(() => {
		if (el) el.innerHTML = html;
	});
</script>

<span class="light-formatted" bind:this={el}></span>

<style>
	.light-formatted {
		display: inline;
		min-width: 0;
	}

	.light-formatted :global(code) {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.92em;
		padding: 0 4px;
		border-radius: 5px;
		background: rgba(51, 112, 154, 0.12);
		color: inherit;
	}

	.light-formatted :global(.inline-emoji) {
		width: 1.25em;
		height: 1.25em;
		vertical-align: -0.22em;
	}

	.light-formatted :global(.message-mention) {
		color: var(--link, #2f7fb8);
		background: rgba(47, 127, 184, 0.12);
		border-radius: 5px;
		padding: 0 3px;
	}
</style>

<script lang="ts">
	import { state as emojisState, emojiUrl } from '$lib/store/emojis.svelte';

	let { unicode, emojiId } = $props<{
		unicode: string | null;
		emojiId: string | null;
	}>();

	// Emojis customizados: imagem do store (reativo); unicode: texto.
	const custom = $derived(emojiId ? emojisState.byId.get(emojiId) : null);
	const url = $derived(custom ? emojiUrl(custom) : '');
</script>

{#if url}
	<img class="reaction-emoji" src={url} alt={custom?.name} />
{:else if unicode}
	{unicode}
{/if}

<style>
	.reaction-emoji {
		display: inline;
		width: 1.7em;
		height: 1.7em;
		vertical-align: text-bottom;
	}
</style>

<script lang="ts">
	import { state as emojisState, emojiUrl } from '$lib/store/emojis.svelte';

	let { unicode, emojiId, isPick = false } = $props<{
		unicode: string | null;
		emojiId: string | null;
		isPick: boolean;
	}>();

	const custom = $derived(emojiId ? emojisState.byId.get(emojiId) : null);
	const url = $derived(custom ? emojiUrl(custom) : '');
</script>

{#if url}
	<span class="{isPick ? 'pick-emoji-wrapper' : 'reaction-emoji-wrapper'}">
		<img class="reaction-emoji" src={url} alt={custom?.name ?? ''} />
	</span>
{:else if unicode}
	{unicode}
{/if}

<style>
	.pick-emoji-wrapper {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3em;
		height: 3em;
		flex: 0 0 3em;
		vertical-align: text-bottom;
	}

	.reaction-emoji-wrapper {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.7em;
		height: 1.7em;
		flex: 0 0 1.7em;
		vertical-align: text-bottom;
	}

	.pick-emoji-wrapper > img.reaction-emoji {
		display: block;
		width: auto !important;
		height: auto !important;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		flex: none;
	}

	.reaction-emoji-wrapper > img.reaction-emoji {
		display: block;
		width: auto !important;
		height: auto !important;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		flex: none;
	}
</style>
<script lang="ts">
	import type { MessageWithAttachment } from '$lib/types';
	import Message from './Message.svelte';

	let {
		messages,
		onAddReaction,
		searchActive = false
	} = $props<{
		messages: MessageWithAttachment[];
		onAddReaction?: (messageId: string, emoji: string) => void;
		searchActive?: boolean;
	}>();

	let listEl: HTMLElement | null = null;

	// Keep the newest message (bottom) in view when new content is added.
	$effect(() => {
		if (!listEl) return;
		// Only auto-scroll when already near the bottom (or when the list
		// first appears), so we don't yank the user up when they are reading
		// older messages.
		const nearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 120;
		if (nearBottom) {
			listEl.scrollTop = listEl.scrollHeight;
		}
	});
</script>

<div class="chat" bind:this={listEl}>
	{#if messages.length === 0}
		<div class="chat-empty">
			<p>{searchActive ? 'Nada encontrado.' : 'Nenhuma mensagem por enquanto.'}</p>
		</div>
	{:else}
		{#each messages as m (m.id)}
			<Message message={m} {onAddReaction} />
		{/each}
	{/if}
</div>

<style>
	.chat-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 100%;
		min-height: 240px;
		color: var(--muted-soft);
		font-size: 14px;
	}
</style>

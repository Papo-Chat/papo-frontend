<script lang="ts">
	import type { MessageWithAttachment } from '$lib/types';
	import Message from './Message.svelte';

	let {
		messages,
		onReply,
		searchActive = false,
		loading = false,
		hasMoreNewer = false,
		onJumpToLatest,
		highlightMessageId = null
	} = $props<{
		messages: MessageWithAttachment[];
		onReply?: (message: MessageWithAttachment) => void;
		searchActive?: boolean;
		loading?: boolean;
		hasMoreNewer?: boolean;
		onJumpToLatest?: () => void;
		highlightMessageId?: string | null;
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

	//	Roll to message target is set, scroll to it and highlight.
	$effect(() => {
		if (!highlightMessageId) return;
		queueMicrotask(() => {
			const el = listEl?.querySelector(`[data-message-id="${highlightMessageId}"]`);
			if (el) {
				el.scrollIntoView({ block: 'nearest' });
			}
		});
	});
</script>

<div class="chat" bind:this={listEl}>
	{#if hasMoreNewer}
		<button
			class="jump-to-latest"
			on:click={onJumpToLatest}
			aria-label="Ir para as últimas mensagens"
		>
			↓ Ver últimas mensagens
		</button>
	{/if}

	{#if loading && messages.length === 0}
		<div class="chat-empty">
			<p>Carregando…</p>
		</div>
	{:else}
		{#if messages.length === 0}
			<div class="chat-empty">
				<p>{searchActive ? 'Nada encontrado.' : 'Nenhuma mensagem por enquanto.'}</p>
			</div>
		{:else}
			{#each messages as m (m.id)}
				<Message message={m} onReply={(msg) => onReply?.(msg)} />
			{/each}
		{/if}
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
	.jump-to-latest {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font: inherit;
		font-size: 13px;
		color: var(--text-secondary);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 4px 10px;
		cursor: pointer;
		margin-bottom: 6px;
	}
	.jump-to-latest:hover {
		background: var(--hover);
		color: var(--text-primary);
	}
</style>

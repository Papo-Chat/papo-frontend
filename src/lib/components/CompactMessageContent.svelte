<script lang="ts">
	import type { MessageWithAttachment } from '$lib/types';
	import FormattedMessage from './FormattedMessage.svelte';
	import Attachment from './Attachment.svelte';
	import PreviewCard from './PreviewCard.svelte';
	import ReactionEmoji from './ReactionEmoji.svelte';

	let {
		content = null,
		message = null,
		highlightText = ''
	} = $props<{
		content?: string | null;
		message?: MessageWithAttachment | null;
		highlightText?: string;
	}>();

	const text = $derived(message?.content ?? content ?? '');
</script>

<div class="compact-message">
	{#if text}
		<div class="compact-text">
			<FormattedMessage content={text} {highlightText} />
		</div>
	{/if}

	{#if message}
		{#if message.attachments.length}
			<div class="compact-attachments">
				{#each message.attachments as attachment (attachment.id)}
					<Attachment {attachment} />
				{/each}
			</div>
		{/if}

		{#if message.previews.length}
			<div class="compact-previews">
				{#each message.previews as preview (preview.id)}
					<PreviewCard {preview} />
				{/each}
			</div>
		{/if}

		{#if message.reactions.length}
			<div class="compact-reactions" aria-label="Reações">
				{#each message.reactions as reaction (reaction.unicode ?? reaction.emoji_id)}
					<span class="compact-reaction">
						<ReactionEmoji unicode={reaction.unicode} emojiId={reaction.emoji_id} />
						<span>{reaction.count}</span>
					</span>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.compact-message {
		display: grid;
		gap: 6px;
		min-width: 0;
		max-width: 100%;
	}

	.compact-text {
		display: -webkit-box;
		overflow: hidden;
		overflow-wrap: anywhere;
		line-height: 1.42;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
	}

	.compact-attachments,
	.compact-previews {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 6px;
		max-width: 100%;
		overflow: hidden;
	}

	.compact-reactions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		max-width: 100%;
	}

	.compact-reaction {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 7px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		font-size: 11px;
		color: var(--text-secondary);
	}

	:global(.compact-message .attachment-image img) {
		max-width: 220px;
		max-height: 130px;
	}

	:global(.compact-message .attachment-media video) {
		max-width: 220px;
		max-height: 130px;
	}

	:global(.compact-message .attachment-audio) {
		max-width: 190px;
	}

	:global(.compact-message .preview-card) {
		max-width: 240px;
		padding: 6px;
	}

	:global(.compact-message .preview-description) {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}
</style>

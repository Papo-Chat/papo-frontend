<script lang="ts">
	import type { MessageWithAttachment } from '$lib/types';
	import FormattedMessage from './FormattedMessage.svelte';
	import Attachment from './Attachment.svelte';
	import PreviewCard from './PreviewCard.svelte';
	import Reactions from './Reactions.svelte';

	let {
		content = null,
		message = null
	} = $props<{
		content?: string | null;
		message?: MessageWithAttachment | null;
	}>();

	const text = $derived(message?.content ?? content ?? '');
</script>

<div class="compact-message">
	{#if text}
		<div class="compact-text">
			<FormattedMessage content={text} />
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
			<div class="compact-reactions">
				<Reactions
					reactions={message.reactions}
					userReactions={message.user_reactions}
					messageId={message.id}
					channelId={message.channel_id}
				/>
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
		max-width: 100%;
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

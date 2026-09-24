<script lang="ts">
	import type { MessageWithAttachment } from '$lib/types';
	import { openProfile } from '$lib/store/ui.svelte';
	import { userById } from '$lib/sample';
	import { formatTime } from '$lib/utils/time';
	import Avatar from './Avatar.svelte';
	import Reactions from './Reactions.svelte';
	import PreviewCard from './PreviewCard.svelte';

	let { message, onAddReaction } = $props<{
		message: MessageWithAttachment;
		onAddReaction?: (messageId: string, emoji: string) => void;
	}>();

	const author = $derived(userById(message.author_id ?? ''));
	const name = $derived(author?.nickname || author?.username || 'Usuário');
</script>

<article class="message">
	<div class="message-enter">
		<Avatar
			username={author?.username ?? 'u'}
			nickname={author?.nickname ?? null}
			size={39}
			ariaLabel={author ? `Ver perfil de ${name}` : undefined}
			onClick={() => {
				if (author) openProfile(author);
			}}
		/>
		<div class="content">
			<div class="meta">
				<button
					class="name"
					aria-label={author ? `Ver perfil de ${name}` : undefined}
					onclick={() => {
						if (author) openProfile(author);
					}}
				>
					{name}
				</button>
				<span class="time">{formatTime(message.created_at)}</span>
			</div>

			{#if message.content}
				<div class="bubble"><p>{message.content}</p></div>
			{:else if message.previews.length}
				{#each message.previews as p (p.id)}
					<PreviewCard preview={p} />
				{/each}
			{/if}

			<Reactions
				messageId={message.id}
				reactions={message.reactions}
				userReactions={message.user_reactions}
				onAddReaction={(emoji) => onAddReaction?.(message.id, emoji)}
			/>
		</div>
	</div>
</article>

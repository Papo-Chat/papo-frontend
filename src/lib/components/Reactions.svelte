<script lang="ts">
	import type { MessageUserReaction, MessageReactionSummary, UserSummary } from '$lib/types';
	import { reactionUsers } from '$lib/sample';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import ReactionUsersPopover from './ReactionUsersPopover.svelte';

	let {
		reactions,
		userReactions,
		messageId
	} = $props<{
		reactions: MessageReactionSummary[];
		userReactions: MessageUserReaction[];
		messageId: string;
	}>();

	// Emoji → phosphor glyph (matches the mockup).
	const EMOJI_ICON: Record<string, string> = {
		'❤️': 'heart',
		'🧡': 'heart',
		'🔴': 'heart',
		'👍': 'thumbs-up',
		'👎': 'thumbs-down',
		'😊': 'smiley',
		'😄': 'smiley',
		'😮': 'smiley',
		'⭐': 'star',
		'🚀': 'rocket-launch',
		'🎉': 'confetti',
		'👌': 'hand-ok',
		'🔥': 'flame',
		'💀': 'skull',
		'👀': 'eye',
		'🙌': 'hands-clapping',
		'🏆': 'trophy'
	};

	const myReactions = $derived(
		new Set(userReactions.map((r: MessageUserReaction) => r.unicode))
	);

	// One reaction-user popover at a time (hover or click to open).
	let openEmoji = $state<string | null>(null);

	const usersFor = (unicode: string, count: number): UserSummary[] =>
		reactionUsers(messageId, unicode, count);

	function toggle(unicode: string): void {
		openEmoji = openEmoji === unicode ? null : unicode;
	}

	function close(): void {
		if (openEmoji) openEmoji = null;
	}
</script>

{#if reactions.length}
	<div class="reactions" role="list">
		{#each reactions as r (r.unicode)}
			<span
				class="reaction-group"
				onmouseenter={() => openEmoji = r.unicode}
				onmouseleave={close}
				onkeydown={(e) => { if (e.key === 'Escape') close(); }}
			>
				<button
					class="react"
					aria-label={`Usuários que reagiram com ${r.unicode}`}
					onclick={() => toggle(r.unicode)}
				>
					{#if EMOJI_ICON[r.unicode]}
						<Icon name={EMOJI_ICON[r.unicode]} variant="duotone" />
					{:else}
						{r.unicode}
					{/if}
					{#if r.count > 1 || !myReactions.has(r.unicode)}
						{r.count}
					{/if}
				</button>
				<ReactionUsersPopover
					emoji={r.unicode}
					users={usersFor(r.unicode, r.count)}
					open={openEmoji === r.unicode}
					onOpenChange={close}
				/>
			</span>
		{/each}
	</div>
{/if}

<style>
	button.react{
		font: inherit;
		-webkit-appearance: none;
		appearance: none;
	}
	button.react i{
		font-size: 16px;
		line-height: 1;
	}
</style>

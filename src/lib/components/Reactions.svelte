<script lang="ts">
	import type { MessageUserReaction, MessageReactionSummary, UserSummary } from '$lib/types';
	import { reactionUsers } from '$lib/sample';
	import type { EmojiOption } from '$lib/utils/emojis';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import ReactionUsersPopover from './ReactionUsersPopover.svelte';

	let { reactions, userReactions, messageId, onAddReaction } = $props<{
		reactions: MessageReactionSummary[];
		userReactions: MessageUserReaction[];
		messageId: string;
		onAddReaction?: (emoji: string) => void;
	}>();

	const myReactions = $derived(new Set(userReactions.map((r: MessageUserReaction) => r.unicode)));

	// One reaction-user popover at a time (hover or click to open).
	let openEmoji = $state<string | null>(null);
	let emojiOpen = $state(false);

	const usersFor = (unicode: string, count: number): UserSummary[] =>
		reactionUsers(messageId, unicode, count);

	function toggle(unicode: string): void {
		openEmoji = openEmoji === unicode ? null : unicode;
	}

	function close(): void {
		if (openEmoji) openEmoji = null;
	}

	function onPickEmoji(emoji: EmojiOption): void {
		onAddReaction?.(emoji.kind === 'unicode' ? emoji.char : emoji.name);
	}
</script>

<div class="reactions" role="list">
	{#each reactions as r (r.unicode)}
		<span
			class="reaction-group"
			onpointerenter={(e) => {
				if (e.pointerType === 'mouse') {
					openEmoji = r.unicode;
				}
			}}
			onpointerleave={(e) => {
				if (e.pointerType === 'mouse') {
					close();
				}
			}}
			onkeydown={(e) => {
				if (e.key === 'Escape') close();
			}}
		>
			<button
				type="button"
				class="react"
				aria-label={`Usuários que reagiram com ${r.unicode}`}
				onclick={() => toggle(r.unicode)}
			>
				{r.unicode}
				{r.count}
			</button>

			<ReactionUsersPopover
				emoji={r.unicode}
				users={usersFor(r.unicode, r.count)}
				open={openEmoji === r.unicode}
				onOpenChange={close}
			/>
		</span>
	{/each}

	<div class="reaction-add-wrap">
		<button
			class="react add-react"
			title="Adicionar reação"
			aria-label="Adicionar reação"
			onclick={() => (emojiOpen = !emojiOpen)}
		>
			<Icon name="smiley" variant="light" />
		</button>
		<EmojiPicker bind:open={emojiOpen} onPick={onPickEmoji} />
	</div>
</div>

<style>
	button.react {
		font: inherit;
		-webkit-appearance: none;
		appearance: none;
	}
	button.react i {
		font-size: 16px;
		line-height: 1;
	}
	.reaction-add-wrap {
		position: relative;
		display: inline-flex;
		align-items: center;
		margin-left: 2px;
	}
	.add-react {
		width: 32px;
		height: 27px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>

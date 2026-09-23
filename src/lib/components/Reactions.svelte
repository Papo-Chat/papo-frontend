<script lang="ts">
	import type {
		MessageUserReaction,
		MessageReactionSummary,
		UserSummary
	} from '$lib/types';
	import { reactionUsers } from '$lib/sample';
	import type { EmojiOption } from '$lib/utils/emojis';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import ReactionUsersPopover from './ReactionUsersPopover.svelte';

	let {
		reactions,
		userReactions,
		messageId,
		onAddReaction
	} = $props<{
		reactions: MessageReactionSummary[];
		userReactions: MessageUserReaction[];
		messageId: string;
		onAddReaction?: (emoji: string) => void;
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

	<div class="reaction-add-wrap">
		<button
			class="react add-react"
			title="Adicionar reação"
			aria-label="Adicionar reação"
			onclick={() => (emojiOpen = !emojiOpen)}
		>
			<Icon name="smiley" variant="light" />
		</button>
		<EmojiPicker open={emojiOpen} onPick={onPickEmoji} />
	</div>
</div>

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
	.reaction-add-wrap{
		position: relative;
		display: inline-flex;
		align-items: center;
		margin-left: 2px;
	}
	.add-react{
		border: 1px solid rgba(76,132,170,.28);
		border-radius: 12px;
		padding: 0;
		min-width: 0;
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		background:
			linear-gradient(145deg, rgba(255,255,255,.5), rgba(238,248,253,.4));
		box-shadow: inset 0 1px 0 rgba(255,255,255,.8);
		cursor: pointer;
		transition:
			transform .16s var(--ease),
			background .16s ease,
			box-shadow .16s ease;
	}
	.add-react:hover{
		transform: translateY(-1px);
		background:
			linear-gradient(145deg, rgba(255,255,255,.7), rgba(238,248,253,.6));
		box-shadow: 0 4px 10px rgba(20,80,120,.14);
	}
	.add-react:active{
		transform: scale(.95);
	}
	.add-react i{
		font-size: 15px;
		line-height: 1;
	}
	/* dark mode: match the existing .react pills */
	[data-theme="dark"] .add-react{
		background:
			linear-gradient(145deg, rgba(61,84,99,.46), rgba(24,48,63,.34));
		border-color: rgba(185,224,248,.10);
		box-shadow: inset 0 1px 0 rgba(255,255,255,.15);
	}
	[data-theme="dark"] .add-react:hover{
		background:
			linear-gradient(145deg, rgba(61,84,99,.56), rgba(24,48,63,.44));
		box-shadow: 0 4px 10px rgba(0,0,0,.2);
	}
</style>

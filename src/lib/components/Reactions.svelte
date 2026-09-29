<script lang="ts">
	import type { MessageUserReaction, MessageReactionSummary, UserSummary } from '$lib/types';
	import * as messagesStore from '$lib/store/messages.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import type { EmojiOption } from '$lib/utils/emojis';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import ReactionEmoji from './ReactionEmoji.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import ReactionUsersPopover from './ReactionUsersPopover.svelte';

	let { reactions, userReactions, messageId, channelId } = $props<{
		reactions: MessageReactionSummary[];
		userReactions: MessageUserReaction[];
		messageId: string;
		channelId: string;
	}>();

	// Chaves (unicode ou emoji_id) das reações do usuário atual.
	const myKeys = $derived(
		new Set(userReactions.map((r: MessageUserReaction) => r.unicode ?? r.emoji_id ?? ''))
	);

	// Destaque (azulado) nas reações do próprio usuário.
	function isMine(r: MessageReactionSummary): boolean {
		return myKeys.has(r.unicode ?? r.emoji_id ?? '');
	}

	// Lista completa de reações do canal (com usuários por emoji), cacheada
	// por mensagem. Buscada uma única vez, sob demanda (primeiro hover/click).
	let cached: {
		reactions: {
			emoji_id: string | null;
			unicode: string | null;
			users: { id: string; user_id: string; created_at: string }[];
		}[];
	} | null = $state(null);

	const usersFor = (emoji: string, count: number): UserSummary[] => {
		if (!cached) return [];
		const found = cached.reactions.find((r) => (r.unicode ?? r.emoji_id) === emoji);
		return (found?.users ?? []).slice(0, count).map((u) => {
			const s = usersStore.state.byId.get(u.user_id) ?? null;
			return {
				id: u.id,
				username: s?.username ?? '',
				nickname: s?.nickname ?? null,
				status: null,
				status_message: null,
				typing: null,
				status_updated_at: null,
				created_at: '',
				roles: []
			};
		});
	};

	function togglePill(r: MessageReactionSummary): void {
		const emoji = r.unicode ?? r.emoji_id ?? '';
		const already = myKeys.has(emoji);
		if (already) {
			messagesStore.unreact(channelId, messageId, {
				emoji_id: r.emoji_id ?? null,
				unicode: r.unicode ?? null
			});
		} else {
			messagesStore.react(channelId, messageId, {
				emoji_id: r.emoji_id ?? null,
				unicode: r.unicode ?? null
			});
		}
	}

	function onPick(emoji: EmojiOption): void {
		if (emoji.kind === 'unicode') {
			messagesStore.react(channelId, messageId, {
				emoji_id: null,
				unicode: emoji.char
			});
		} else {
			messagesStore.react(channelId, messageId, {
				emoji_id: emoji.id,
				unicode: null
			});
		}
	}

	// One reaction-user popover at a time (hover or click to open).
	let openEmoji = $state<string | null>(null);
	let emojiOpen = $state(false);

	function ensureUsers(): void {
		if (cached) return;
		messagesStore
			.reactionUsers(channelId, messageId)
			.then((res) => {
				cached = {
					reactions: res.reactions.map((r) => ({
						emoji_id: r.emoji_id,
						unicode: r.unicode,
						users: r.users
					}))
				};
			})
			.catch(() => {});
	}

	function openPopover(emoji: string): void {
		openEmoji = emoji;
		ensureUsers();
	}

	function close(): void {
		if (openEmoji) openEmoji = null;
	}
</script>

<div class="reactions" role="list">
	{#each reactions as r (r.unicode ?? r.emoji_id)}
		<span
			class="reaction-group"
			onpointerenter={(e) => {
				if (e.pointerType === 'mouse') {
					openEmoji = r.unicode ?? r.emoji_id ?? '';
					ensureUsers();
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
				class="react {isMine(r) ? 'mine' : ''}"
				aria-label={`Usuários que reagiram`}
				onclick={() => togglePill(r)}
			>
				<ReactionEmoji unicode={r.unicode} emojiId={r.emoji_id} />
				{r.count}
			</button>

			<ReactionUsersPopover
				emoji={r.unicode ?? r.emoji_id ?? ''}
				users={usersFor(r.unicode ?? r.emoji_id ?? '', r.count)}
				open={openEmoji === (r.unicode ?? r.emoji_id ?? '')}
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
		<EmojiPicker bind:open={emojiOpen} {onPick} />
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
	.reaction-group .react.mine {
		background: rgba(10, 132, 255, 0.15);
		border-color: rgba(10, 132, 255, 0.5);
		color: var(--blue);
	}
</style>

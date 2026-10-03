<script lang="ts">
	import type { MessageUserReaction, MessageReactionSummary, UserSummary } from '$lib/types';
	import * as messagesStore from '$lib/store/messages.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import { meId } from '$lib/store/session.svelte';
	import type { EmojiOption } from '$lib/utils/emojis';
	import { mergeGroups, type KeysetCursor } from '$lib/utils/keyset';

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

	const reactionKey = (emojiId: string | null, unicode: string | null) =>
		`${emojiId ?? ''}:${unicode ?? ''}`;

	const myKeys = $derived(
		new Set(userReactions.map((r: MessageUserReaction) => reactionKey(r.emoji_id, r.unicode)))
	);

	function isMine(r: MessageReactionSummary): boolean {
		return myKeys.has(reactionKey(r.emoji_id ?? null, r.unicode ?? null));
	}

	let cached: {
		reactions: {
			emoji_id: string | null;
			unicode: string | null;
			count: number;
			users: { id: string; user_id: string; created_at: string }[];
		}[];
	} | null = $state(null);

	let cursor: KeysetCursor | null = $state(null);
	let hasMore = $state(false);
	let loadingUsers = $state(false);
	let userLoadGen = 0;

	const usersFor = (emoji: string, count: number): UserSummary[] => {
		if (!cached) return [];

		const found = cached.reactions.find((r) => (r.unicode ?? r.emoji_id) === emoji);

		return (found?.users ?? []).slice(0, count).map((u) => {
			const s = usersStore.state.byId.get(u.user_id) ?? null;

			if (s) {
				return s;
			}

			// MessageReactionUser.id is the reaction row id, not the user id.
			// Avatar/profile loading must always use user_id.
			return {
				id: u.user_id,
				username: '',
				nickname: null,
				banned: false,
				status: null,
				status_message: null,
				typing: null,
				status_updated_at: null,
				created_at: u.created_at,
				roles: []
			};
		});
	};

	function invalidateUsersCache(): void {
		cached = null;
		cursor = null;
		hasMore = false;
		userLoadGen++;
		loadingUsers = false;
	}

	function patchCachedMine(r: MessageReactionSummary, remove: boolean): void {
		if (!cached) return;

		const mine = meId();
		if (!mine) return;

		const key = reactionKey(r.emoji_id ?? null, r.unicode ?? null);
		const group = cached.reactions.find(
			(g) => reactionKey(g.emoji_id, g.unicode) === key
		);
		if (!group) return;

		const hasMine = group.users.some((u) => u.user_id === mine);

		if (remove) {
			if (!hasMine) return;
			group.users = group.users.filter((u) => u.user_id !== mine);
			group.count = Math.max(0, group.count - 1);
		} else {
			if (hasMine) return;
			group.users = [
				{
					id: `local:${mine}:${Date.now()}`,
					user_id: mine,
					created_at: new Date().toISOString()
				},
				...group.users
			];
			group.count += 1;
		}

		cached = {
			reactions: cached.reactions.map((g) =>
				reactionKey(g.emoji_id, g.unicode) === key ? { ...g, users: [...g.users] } : g
			)
		};
	}

	function togglePill(r: MessageReactionSummary): void {
		const already = isMine(r);
		const req = {
			emoji_id: r.emoji_id ?? null,
			unicode: r.unicode ?? null
		};

		// Keep an open mobile popover stable: update its cached user list
		// optimistically instead of clearing/remounting it.
		patchCachedMine(r, already);

		const request = already
			? messagesStore.unreact(channelId, messageId, req)
			: messagesStore.react(channelId, messageId, req);

		void request.catch(() => {
			// messagesStore rolls back the message counters; mirror that rollback
			// in the open reaction-user list.
			patchCachedMine(r, !already);
		});
	}

	function onPick(emoji: EmojiOption): void {
		invalidateUsersCache();

		if (emoji.kind === 'unicode') {
			void messagesStore.react(channelId, messageId, {
				emoji_id: null,
				unicode: emoji.char
			});
		} else {
			void messagesStore.react(channelId, messageId, {
				emoji_id: emoji.id,
				unicode: null
			});
		}
	}

	let openEmoji = $state<string | null>(null);
	let emojiOpen = $state(false);

	async function loadPage(
		q?: { since?: string; last_id?: string },
		requestGen?: number
	): Promise<void> {
		if (loadingUsers) return;

		const gen = requestGen ?? ++userLoadGen;
		loadingUsers = true;
		try {
			const res = await messagesStore.reactionUsers(channelId, messageId, q);
			if (userLoadGen !== gen) return;

			const fresh = res.reactions.map((r) => ({
				emoji_id: r.emoji_id,
				unicode: r.unicode,
				count: r.count,
				users: r.users
			}));

			cached = cached
				? { reactions: mergeGroups([...cached.reactions, ...fresh]) }
				: { reactions: mergeGroups(fresh) };
			cursor = reactionPageCursor(res);
			hasMore = res.has_more;
		} catch {
			// Best effort: keep the existing reaction counters visible.
		} finally {
			if (userLoadGen === gen) loadingUsers = false;
		}
	}

	function reactionPageCursor(res: {
		reactions: {
			emoji_id: string | null;
			unicode: string | null;
			users: { id: string; user_id: string; created_at: string }[];
		}[];
	}): KeysetCursor | null {
		const groups = res.reactions;
		if (groups.length === 0) return null;

		const users = groups[groups.length - 1].users;
		if (users.length === 0) return null;

		const last = users[users.length - 1];
		return { since: last.created_at, last_id: last.id };
	}

	async function ensureUsers(emoji: string): Promise<void> {
		if (loadingUsers) return;
		const existing = cached?.reactions.find((r) => (r.unicode ?? r.emoji_id) === emoji);
		if (existing?.users.length) return;

		const gen = ++userLoadGen;
		let nextCursor: KeysetCursor | null = null;
		let more = true;
		while (more && userLoadGen === gen) {
			await loadPage(
				nextCursor ? { since: nextCursor.since, last_id: nextCursor.last_id } : undefined,
				gen
			);
			const found = cached?.reactions.find((r) => (r.unicode ?? r.emoji_id) === emoji);
			if (found?.users.length) return;
			nextCursor = cursor;
			more = hasMore && nextCursor !== null;
		}
	}

	function loadMoreFor(emoji: string): void {
		const pill = reactions.find(
			(r: MessageReactionSummary) => (r.unicode ?? r.emoji_id) === emoji
		);
		const need = pill?.count ?? 0;

		const have =
			cached?.reactions.find(
				(r: { emoji_id: string | null; unicode: string | null }) =>
					(r.unicode ?? r.emoji_id) === emoji
			)?.users?.length ?? 0;

		if (!hasMore || !cursor || loadingUsers || have >= need) return;

		void loadPage({ since: cursor.since, last_id: cursor.last_id });
	}

	function openPopover(emoji: string): void {
		openEmoji = emoji;
		void ensureUsers(emoji);
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
					const emoji = r.unicode ?? r.emoji_id ?? '';
					openEmoji = emoji;
					void ensureUsers(emoji);
				}
			}}
			onpointerleave={(e) => {
				if (e.pointerType === 'mouse') close();
			}}
			onkeydown={(e) => {
				if (e.key === 'Escape') close();
			}}
		>
			<button
				type="button"
				class="react {isMine(r) ? 'mine' : ''}"
				aria-label="Usuários que reagiram"
				onpointerup={(e) => {
					const emoji = r.unicode ?? r.emoji_id ?? '';

					if (e.pointerType === 'touch') {
						openPopover(emoji);
					} else {
						togglePill(r);
					}
				}}
			>
				<ReactionEmoji unicode={r.unicode} emojiId={r.emoji_id} />
				{r.count}
			</button>

			<ReactionUsersPopover
				emoji={r.unicode ?? r.emoji_id ?? ''}
				unicode={r.unicode}
				emojiId={r.emoji_id}
				users={usersFor(r.unicode ?? r.emoji_id ?? '', r.count)}
				open={openEmoji === (r.unicode ?? r.emoji_id ?? '')}
				onOpenChange={close}
				isMine={isMine(r)}
				onToggle={() => togglePill(r)}
				onLoadMore={() => loadMoreFor(r.unicode ?? r.emoji_id ?? '')}
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

		{#if emojiOpen}
			<EmojiPicker bind:open={emojiOpen} {onPick} />
		{/if}
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
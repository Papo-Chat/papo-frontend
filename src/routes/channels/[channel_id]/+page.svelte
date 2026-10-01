<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { page } from '$app/state';

	import * as channelsStore from '$lib/store/channels.svelte';
	import * as messagesStore from '$lib/store/messages.svelte';
	import * as usersStore from '$lib/store/users.svelte';

	import { typingUsers } from '$lib/store/users.svelte';
	import { state as uiState, setScrollTarget } from '$lib/store/ui.svelte';

	import type { MessageWithAttachment, SearchResult } from '$lib/types';

	import Topbar from '$lib/components/Topbar.svelte';
	import Chat from '$lib/components/Chat.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import VoiceRoom from '$lib/components/VoiceRoom.svelte';
	import VoiceTextDrawer from '$lib/components/VoiceTextDrawer.svelte';
	import Avatar from '$lib/components/Avatar.svelte';

	// Resolve o canal da URL (id exato, depois nome).
	const channel = $derived(
		channelsStore.resolve(page.params.channel_id) ??
			channelsStore.homeChannel()
	);

	const ch = $derived(
		channel && messagesStore.getChannel(channel.id)
	);

	const messages = $derived(
		ch
			? (ch.ids
					.map((id) => ch.byId.get(id) ?? null)
					.filter(Boolean) as MessageWithAttachment[])
			: []
	);

	let replyTo: MessageWithAttachment | null = $state(null);

	let searchQuery = $state('');
	let searchOpen = $state(false);

	let highlightMessageId: string | null = $state(null);
	let lastVoiceChannelId: string | null = null;

	const loading = $derived(!!ch && ch.loading);
	const hasMoreNewer = $derived(!!ch && ch.hasMoreNewer);
	const hasMoreOlder = $derived(!!ch && ch.hasMoreOlder);
	const joinNotice=$derived(usersStore.state.joinNotice?{id:usersStore.state.joinNotice.id,name:usersStore.state.byId.get(usersStore.state.joinNotice.userId)?.nickname||usersStore.state.byId.get(usersStore.state.joinNotice.userId)?.username||'Novo membro'}:null);

	// Indicador de digitando.
	const typingIds = $derived(
		channel?.id ? typingUsers(channel.id) : []
	);

	const typingNames = $derived(
		typingIds
			.map(
				(id) =>
					usersStore.state.byId.get(id)?.nickname ||
					usersStore.state.byId.get(id)?.username ||
					''
			)
			.filter(Boolean)
	);

	const typingText = $derived(
		typingNames.length === 0
			? 'Alguém está digitando'
			: typingNames.length === 1
				? `${typingNames[0]} está digitando`
				: `${typingNames.join(', ')} estão digitando`
	);

	const typingChars = $derived(Array.from(typingText));

	$effect(() => {
		const id = channel?.id ?? null;
		const type = channel?.type;

		if (type !== 'voice') {
			lastVoiceChannelId = null;
			uiState.voiceChatDrawerOpen = false;
			return;
		}

		if (id && id !== lastVoiceChannelId) {
			lastVoiceChannelId = id;
			uiState.voiceChatDrawerOpen = false;
		}
	});

	// Carrega histórico e mensagens fixadas quando o canal muda.
	$effect(() => {
		const id = channel?.id;

		if (!id) return;

		untrack(() => {
			messagesStore.ensureLoaded(id);
			messagesStore.loadPinned(id);
			channelsStore.setOpen(id);
		});
	});


	// Consome scroll target global: load the message into the window (paging
	// towards older if it isn't visible yet), then scroll + highlight.
	$effect(() => {
		const target = uiState.scrollToMessageId;

		if (!target) return;

		uiState.scrollToMessageId = null;
		if (!channel) return;

		if (channel.type === 'voice') {
			uiState.channelsDrawerOpen = false;
			uiState.membersDrawerOpen = false;
			uiState.voiceChatDrawerOpen = true;
		}

		const { messageId, createdAt } = target;

		void messagesStore
			.gotoMessage(channel.id, messageId, createdAt)
			.then((found) => {
				if (!found) return;

				highlightMessageId = messageId;

				queueMicrotask(() => {
					setTimeout(() => {
						highlightMessageId = null;
					}, 2500);
				});
			});
	});

	function SendMsg(
		text: string | null,
		files: File[] = [],
		onProgress?: (percent: number) => void
	): Promise<void> {
		if (!channel) {
			return Promise.resolve();
		}

		return messagesStore
			.send({
				channel_id: channel.id,
				content: text,
				reply_to: replyTo?.id ?? null,
				files,
				onProgress
			})
			.then(() => {
				replyTo = null;
			});
	}

	function onReply(msg: MessageWithAttachment): void {
		replyTo = msg;
	}

	function onReplyCancel(): void {
		replyTo = null;
	}

	function onSearchQueryChange(q: string): void {
		searchQuery = q;
	}

	function onSearchOpenChange(open: boolean): void {
		searchOpen = open;
	}

	function onSearchResult(result: SearchResult): void {
		const msgId = result.id;

		if (channel && result.channel_id === channel.id) {
			if (channel.type === 'voice') {
				uiState.channelsDrawerOpen = false;
				uiState.membersDrawerOpen = false;
				uiState.voiceChatDrawerOpen = true;
			}

			void messagesStore
				.gotoMessage(channel.id, msgId, result.created_at)
				.then((found) => {
					if (!found) return;
					highlightMessageId = msgId;
					queueMicrotask(() => {
						setTimeout(() => {
							highlightMessageId = null;
						}, 2500);
					});
				});
			return;
		}

		// Outro canal: navega e destaca ali.
		setScrollTarget(msgId, result.created_at);
		goto(`/channels/${result.channel_id}`);
	}
</script>

{#if channel}
	<Topbar
		{channel}
		{searchQuery}
		{searchOpen}
		{onSearchQueryChange}
		{onSearchOpenChange}
		{onSearchResult}
	/>

	{#if channel.type === 'voice'}
		<div class="voice-content">
			<VoiceRoom {channel} />
			<VoiceTextDrawer
				{channel}
				open={uiState.voiceChatDrawerOpen}
				{messages}
				{loading}
				{hasMoreNewer}
				{hasMoreOlder}
				{highlightMessageId}
				{joinNotice}
				{replyTo}
				disabled={!messagesStore.getChannel(channel.id)}
				{onReply}
				{onReplyCancel}
				onSend={SendMsg}
				onOpenChange={(open) => (uiState.voiceChatDrawerOpen = open)}
				onJumpToLatest={() => messagesStore.setLatest(channel.id)}
				onJumpToLastRead={() =>
					channel.last_read_message
						? messagesStore.gotoMessage(channel.id, channel.last_read_message, null)
						: Promise.resolve(false)
				}
				onLoadMoreOlder={() => messagesStore.loadMoreOlder(channel.id)}
				onLoadMoreNewer={() => messagesStore.loadMoreNewer(channel.id)}
				onReachLatest={(message) => {
					if (message) {
						channelsStore.markReadLocal(channel.id, message.id, message.created_at);
					}
				}}
			/>
		</div>
	{:else}
		{#key channel.id}<Chat
			{messages}
			{loading}
			{hasMoreNewer}
			{hasMoreOlder}
			{highlightMessageId}
			{joinNotice}
			{onReply}
			onJumpToLatest={() => messagesStore.setLatest(channel.id)}
			onJumpToLastRead={() =>
				channel.last_read_message
					? messagesStore.gotoMessage(channel.id, channel.last_read_message, null)
					: Promise.resolve(false)
			}
			onLoadMoreOlder={() => messagesStore.loadMoreOlder(channel.id)}
			onLoadMoreNewer={() => messagesStore.loadMoreNewer(channel.id)}
			onReachLatest={(message) => {
				if (message) {
					channelsStore.markReadLocal(channel.id, message.id, message.created_at);
				}
			}}
			lastReadMessageId={channel.last_read_message}
		/>{/key}

		<div class="composer-area">
			{#if typingIds.length > 0}
				<div
					class="typing-strip"
					role="status"
					aria-label="Indicador de digitação"
				>
					<span class="typing-avatars">
						{#each typingIds as uid (uid)}
							{@const u = usersStore.state.byId.get(uid)}

							<Avatar user={u} userId={uid} size={18} />
						{/each}
					</span>

					<span
						class="typing-text"
						aria-label={typingText + '...'}
					>
						<span
							class="typing-wave"
							aria-hidden="true"
						>
							{#each typingChars as char, i}
								<span
									class="typing-char"
									style={`--i: ${i}`}
								>
									{char === ' '
										? '\u00A0'
										: char}
								</span>
							{/each}
						</span>

						<span
							class="typing-dots"
							aria-hidden="true"
						>
							<span>.</span>
							<span>.</span>
							<span>.</span>
						</span>
					</span>
				</div>
			{/if}

			<Composer
				onSend={SendMsg}
				channelId={channel.id}
				{replyTo}
				{onReplyCancel}
				disabled={!messagesStore.getChannel(channel.id)}
			/>
		</div>
	{/if}
{:else}
	<div class="loading-fallback">
		<span>Carregando…</span>
	</div>
{/if}

<style>
	.voice-content {
		position: relative;
		min-width: 0;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
	}

	.voice-content :global(.voice-room) {
		width: 100%;
		max-width: 100%;
		min-width: 0;
		min-height: 100%;
	}

	.typing-wave {
		display: inline-flex;
	}

	.typing-char {
		display: inline-block;
		animation: typing-wave 1.35s ease-in-out infinite;
		animation-delay: calc(var(--i) * 35ms);
	}

	@keyframes typing-wave {
		0%,
		60%,
		100% {
			transform: translateY(0);
		}

		30% {
			transform: translateY(-3px);
		}
	}

	.typing-dots {
		display: inline-flex;
		margin-left: 1px;
		min-width: 1.5em;
	}

	.typing-dots span:nth-child(2) {
		animation: typing-dot-2 1.2s steps(1, end) infinite;
	}

	.typing-dots span:nth-child(3) {
		animation: typing-dot-3 1.2s steps(1, end) infinite;
	}

	@keyframes typing-dot-2 {
		0%,
		32% {
			opacity: 0;
		}

		33%,
		100% {
			opacity: 1;
		}
	}

	@keyframes typing-dot-3 {
		0%,
		65% {
			opacity: 0;
		}

		66%,
		100% {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.typing-char,
		.typing-dots span {
			animation: none;
		}

		.typing-dots span {
			opacity: 1;
		}
	}

	.loading-fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--muted-soft);
		font-size: 14px;
	}

	.composer-area {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
	}

	.typing-strip {
		position: absolute;
		left: 14px;
		bottom: calc(100% + 6px);
		z-index: 20;

		display: flex;
		align-items: center;
		gap: 6px;

		padding: 4px 8px;
		max-width: calc(100% - 28px);

		font-size: 12px;
		font-style: italic;

		background: #d6e4e8;
		border: 1px solid #f3f7f8;
		color: #24343d;

		border-radius: 10px;
		box-shadow: 0 4px 14px rgb(0 0 0 / 0.12);

		pointer-events: none;
	}

	:global([data-theme='dark']) .typing-strip {
		background: #203340;
		border-color: #365064;
		color: #f4f6f7;
	}

	.typing-avatars {
		display: flex;
		gap: 2px;
	}

	.typing-avatar-fallback {
		display: inline-block;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--border);
	}

	.typing-text {
		color: rgb(44, 44, 44);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global([data-theme='dark']) .typing-text {
		color: rgb(248, 248, 248);
	}
</style>
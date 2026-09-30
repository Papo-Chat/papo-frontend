<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { page } from '$app/state';

	import * as channelsStore from '$lib/store/channels.svelte';
	import * as messagesStore from '$lib/store/messages.svelte';
	import * as voiceStore from '$lib/store/voice.svelte';
	import * as usersStore from '$lib/store/users.svelte';

	import { typingUsers } from '$lib/store/users.svelte';
	import { state as uiState, setScrollTarget } from '$lib/store/ui.svelte';

	import type { MessageWithAttachment, SearchResult } from '$lib/types';

	import Topbar from '$lib/components/Topbar.svelte';
	import Chat from '$lib/components/Chat.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import VoiceRoom from '$lib/components/VoiceRoom.svelte';
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

	const loading = $derived(!!ch && ch.loading);
	const hasMoreNewer = $derived(!!ch && ch.hasMoreNewer);

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


	// Consome scroll target global.
	$effect(() => {
		const target = uiState.scrollToMessageId;

		if (!target) return;

		uiState.scrollToMessageId = null;

		if (channel && target === channel.id) {
			return;
		}

		if (!ch) return;

		const exists = ch.ids.some((id) => id === target);

		if (!exists) return;

		highlightMessageId = target;

		queueMicrotask(() => {
			setTimeout(() => {
				highlightMessageId = null;
			}, 2500);
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
			.then((msg) => {
				messagesStore.applySendResponse(channel.id, msg);
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
			const chState = messagesStore.getChannel(channel.id);

			const exists =
				chState?.ids.some((id) => id === msgId) ?? false;

			if (!exists) return;

			highlightMessageId = msgId;

			queueMicrotask(() => {
				setTimeout(() => {
					highlightMessageId = null;
				}, 2500);
			});

			return;
		}

		// Outro canal: navega e destaca ali.
		setScrollTarget(msgId);
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
		<VoiceRoom {channel} />
	{:else}
		<Chat
			{messages}
			{loading}
			{hasMoreNewer}
			{highlightMessageId}
			{onReply}
			lastReadMessageId={channel.last_read_message}
		/>

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

							<Avatar user={u} size={18} />
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
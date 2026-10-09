<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { ApiError } from '$lib/api';
	import * as dmsStore from '$lib/store/dms.svelte';
	import * as channelsStore from '$lib/store/channels.svelte';
	import * as messagesStore from '$lib/store/messages.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import { meId } from '$lib/store/session.svelte';
	import { state as uiState } from '$lib/store/ui.svelte';
	import type { EmbedInput, MessageWithAttachment, SearchResult } from '$lib/types';
	import DmTopbar from '$lib/components/DmTopbar.svelte';
	import Chat from '$lib/components/Chat.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import Avatar from '$lib/components/Avatar.svelte';

	const dm = $derived(dmsStore.get(page.params.dm_id));
	const conversation = $derived(dm ? messagesStore.getChannel(dm.id) : null);
	const messages = $derived(
		conversation
			? (conversation.ids
					.map((id) => conversation.byId.get(id) ?? null)
					.filter(Boolean) as MessageWithAttachment[])
			: []
	);
	const loading = $derived(!!conversation && conversation.loading);
	const hasMoreNewer = $derived(!!conversation && conversation.hasMoreNewer);
	const hasMoreOlder = $derived(!!conversation && conversation.hasMoreOlder);

	let replyTo: MessageWithAttachment | null = $state(null);
	let searchQuery = $state('');
	let searchOpen = $state(false);
	let highlightMessageId: string | null = $state(null);
	let lastHistoryDmId: string | null = null;

	const typingIds = $derived(
		dm ? usersStore.typingUsers(dm.id).filter((id) => id !== meId()) : []
	);
	const typingNames = $derived(
		typingIds
			.map((id) => usersStore.state.byId.get(id)?.nickname || usersStore.state.byId.get(id)?.username || '')
			.filter(Boolean)
	);
	const typingText = $derived(
		typingNames.length === 1
			? `${typingNames[0]} está digitando`
			: typingNames.length > 1
				? `${typingNames.join(', ')} estão digitando`
				: ''
	);

	function homePath(): string {
		const home = channelsStore.homeChannel();
		return home ? `/channels/${home.id}` : '/';
	}

	function highlight(id: string): void {
		highlightMessageId = id;
		setTimeout(() => {
			if (highlightMessageId === id) highlightMessageId = null;
		}, 2500);
	}

	$effect(() => {
		const id = page.params.dm_id;
		if (!id) return;

		untrack(() => {
			dmsStore.setOpen(id);
			channelsStore.setOpen(null);
			if (id !== lastHistoryDmId) {
				lastHistoryDmId = id;
				void messagesStore.setLatest(id);
				void messagesStore.loadPinned(id);
			}
		});

		return () => {
			if (dmsStore.state.openDmId === id) dmsStore.setOpen(null);
		};
	});

	$effect(() => {
		const target = uiState.scrollToMessageId;
		const id = dm?.id;
		if (!target || !id) return;

		uiState.scrollToMessageId = null;
		void messagesStore.gotoMessage(id, target.messageId, target.createdAt).then((found) => {
			if (found) highlight(target.messageId);
		});
	});

	async function sendMessage(
		text: string | null,
		files: File[] = [],
		onProgress?: (percent: number) => void,
		embeds: EmbedInput[] = []
	): Promise<void> {
		if (!dm) return;

		try {
			await messagesStore.send({
				channel_id: dm.id,
				content: text,
				reply_to: replyTo?.id ?? null,
				files,
				embeds,
				onProgress
			});
			replyTo = null;
		} catch (error) {
			if (
				error instanceof ApiError &&
				error.status === 403 &&
				(error.type.includes('dm-blocked') || error.detail.includes('direta'))
			) {
				dmsStore.drop(dm.id);
				await goto(homePath());
			}
			throw error;
		}
	}

	function onSearchResult(result: SearchResult): void {
		if (!dm || result.channel_id !== dm.id) return;
		void messagesStore.gotoMessage(dm.id, result.id, result.created_at).then((found) => {
			if (found) highlight(result.id);
		});
	}
</script>

{#if dm}
	<DmTopbar
		{dm}
		{searchQuery}
		{searchOpen}
		onSearchOpenChange={(open) => (searchOpen = open)}
		{onSearchResult}
	/>

	{#key dm.id}
		<Chat
			{messages}
			{loading}
			{hasMoreNewer}
			{hasMoreOlder}
			{highlightMessageId}
			lastReadMessageId={dm.last_read_message}
			onReply={(message) => (replyTo = message)}
			onJumpToLatest={() => messagesStore.setLatest(dm.id)}
			onJumpToLastRead={() =>
				dm.last_read_message
					? messagesStore.gotoMessage(dm.id, dm.last_read_message, null)
					: Promise.resolve(false)
			}
			onLoadMoreOlder={() => messagesStore.loadMoreOlder(dm.id)}
			onLoadMoreNewer={() => messagesStore.loadMoreNewer(dm.id)}
			onReachLatest={(message) => {
				if (message) {
					dmsStore.markReadLocal(dm.id, message.id, message.created_at);
				}
			}}
		/>
	{/key}

	<div class="composer-area dm-composer-area">
		{#if typingIds.length > 0}
			<div class="typing-strip" role="status" aria-label={typingText}>
				<span class="typing-avatars">
					{#each typingIds as userId (userId)}
						<Avatar user={usersStore.state.byId.get(userId)} userId={userId} size={18} />
					{/each}
				</span>
				<span class="typing-copy">{typingText}<span class="typing-dots" aria-hidden="true">...</span></span>
			</div>
		{/if}

		<Composer
			onSend={sendMessage}
			channelId={dm.id}
			{replyTo}
			onReplyCancel={() => (replyTo = null)}
			disabled={!messagesStore.getChannel(dm.id)}
			allowAttachments={true}
		/>
	</div>
{:else}
	<div class="dm-loading">Carregando conversa…</div>
{/if}

<style>
	.dm-composer-area {
		position: relative;
	}

	.typing-strip {
		min-height: 22px;
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 0 18px 4px;
		color: var(--muted-soft);
		font-size: 10px;
		font-weight: 650;
	}

	.typing-avatars {
		display: inline-flex;
		align-items: center;
	}

	.typing-avatars :global(.avatar + .avatar) {
		margin-left: -5px;
	}

	.typing-dots {
		display: inline-block;
		min-width: 14px;
		animation: dm-typing-pulse 1.15s steps(4, end) infinite;
	}

	@keyframes dm-typing-pulse {
		0%, 20% { opacity: .28; }
		60%, 100% { opacity: 1; }
	}

	.dm-loading {
		display: grid;
		place-items: center;
		min-height: 0;
		color: var(--muted-soft);
		font-size: 13px;
	}

	:global(html[data-ui-mobile]) .typing-dots,
	:global(html[data-ui-flat]) .typing-dots {
		animation: none;
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.typing-dots {
			animation: none;
			opacity: 1;
		}
	}

	@media (max-width: 700px) {
		.typing-strip {
			padding-inline: 12px;
		}
	}
</style>

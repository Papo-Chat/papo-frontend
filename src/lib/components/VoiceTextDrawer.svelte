<script lang="ts">
	import { typingUsers } from '$lib/store/users.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import type { Channel, MessageWithAttachment } from '$lib/types';
	import Avatar from './Avatar.svelte';
	import Chat from './Chat.svelte';
	import Composer from './Composer.svelte';
	import Icon from './Icon.svelte';

	let {
		channel,
		open,
		messages,
		loading = false,
		hasMoreNewer = false,
		hasMoreOlder = false,
		highlightMessageId = null,
		joinNotice = null,
		replyTo = null,
		onOpenChange,
		onReply,
		onReplyCancel,
		onSend,
		onJumpToLatest,
		onJumpToLastRead,
		onLoadMoreOlder,
		onLoadMoreNewer,
		onReachLatest
	} = $props<{
		channel: Channel;
		open: boolean;
		messages: MessageWithAttachment[];
		loading?: boolean;
		hasMoreNewer?: boolean;
		hasMoreOlder?: boolean;
		highlightMessageId?: string | null;
		joinNotice?: { id: number; name: string } | null;
		replyTo?: MessageWithAttachment | null;
		onOpenChange?: (open: boolean) => void;
		onReply?: (message: MessageWithAttachment) => void;
		onReplyCancel?: () => void;
		onSend?: (
			text: string | null,
			files?: File[],
			onProgress?: (percent: number) => void
		) => Promise<void>;
		onJumpToLatest?: () => void | Promise<void>;
		onJumpToLastRead?: () => void | Promise<boolean>;
		onLoadMoreOlder?: () => void | Promise<void>;
		onLoadMoreNewer?: () => void | Promise<void>;
		onReachLatest?: (message: MessageWithAttachment | null) => void;
	}>();

	const typingIds = $derived(channel.id ? typingUsers(channel.id) : []);
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

	function close(): void {
		onOpenChange?.(false);
	}
</script>

{#if open}
	<button
		class="voice-chat-overlay"
		type="button"
		aria-label="Fechar chat de texto"
		onclick={close}
	></button>
{/if}

<aside
	class="voice-text-drawer"
	class:open
	aria-hidden={!open}
	aria-label="Chat de texto do canal de voz"
>
	<header class="voice-text-head">
		<div class="voice-text-title">
			<Icon name="chat-circle-text" variant="light" />
			<div>
				<strong>Chat de texto</strong>
				<span>#{channel.name}</span>
			</div>
		</div>
		<button class="voice-text-close" type="button" onclick={close} aria-label="Fechar chat">
			<Icon name="x" variant="light" />
		</button>
	</header>

	<div class="voice-text-chat">
		{#key channel.id}
			<Chat
				{messages}
				{loading}
				{hasMoreNewer}
				{hasMoreOlder}
				{highlightMessageId}
				{joinNotice}
				{onReply}
				{onJumpToLatest}
				{onJumpToLastRead}
				{onLoadMoreOlder}
				{onLoadMoreNewer}
				{onReachLatest}
				lastReadMessageId={channel.last_read_message}
			/>
		{/key}
	</div>

	<div class="voice-text-composer">
		{#if typingIds.length > 0}
			<div class="voice-typing-strip" role="status" aria-label={typingText + '...'}>
				<span class="typing-avatars">
					{#each typingIds as uid (uid)}
						<Avatar user={usersStore.state.byId.get(uid)} userId={uid} size={18} />
					{/each}
				</span>
				<span class="typing-copy">{typingText}...</span>
			</div>
		{/if}

		<Composer
			{onSend}
			channelId={channel.id}
			{replyTo}
			{onReplyCancel}
			disabled={loading && messages.length === 0}
		/>
	</div>
</aside>

<style>
	.voice-chat-overlay {
		display: none;
	}

	.voice-text-drawer {
		position: absolute;
		z-index: 70;
		top: 8px;
		right: 8px;
		bottom: 8px;
		width: min(460px, calc(100% - 16px));
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.72);
		border-radius: 22px;
		background:
			radial-gradient(circle at 16% -12%, rgba(255, 255, 255, 0.34), transparent 34%),
			linear-gradient(150deg, rgba(242, 251, 255, 0.94), rgba(209, 236, 249, 0.9));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.9),
			0 24px 58px rgba(3, 39, 72, 0.26);
		backdrop-filter: blur(20px) saturate(140%);
		-webkit-backdrop-filter: blur(20px) saturate(140%);
		opacity: 0;
		transform: translate3d(12px, 0, 0) scale(0.985);
		pointer-events: none;
		transition:
			opacity 170ms ease,
			transform 220ms var(--ease);
	}

	.voice-text-drawer.open {
		opacity: 1;
		transform: translate3d(0, 0, 0) scale(1);
		pointer-events: auto;
	}

	.voice-text-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 12px 10px 14px;
		border-bottom: 1px solid rgba(75, 132, 168, 0.16);
	}

	.voice-text-title {
		display: flex;
		align-items: center;
		gap: 9px;
		min-width: 0;
	}

	.voice-text-title > :global(.icon) {
		flex: 0 0 auto;
	}

	.voice-text-title div {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.voice-text-title strong {
		font-size: 13px;
	}

	.voice-text-title span {
		overflow: hidden;
		color: var(--muted-soft);
		font-size: 11px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.voice-text-close {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		flex: 0 0 34px;
		padding: 0;
		border: 1px solid rgba(255, 255, 255, 0.62);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.38);
		color: var(--text);
		cursor: pointer;
	}

	.voice-text-chat {
		display: flex;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.voice-text-chat :global(.chat) {
		padding: 12px 14px 10px;
	}

	.voice-text-chat :global(.message) {
		margin-bottom: 12px;
	}

	.voice-text-chat :global(.message .content) {
		max-width: calc(100% - 50px);
	}

	.voice-text-composer {
		position: relative;
		min-width: 0;
		padding-top: 4px;
	}

	.voice-text-composer :global(.composer) {
		margin: 0 8px 8px;
		padding: 8px;
		gap: 7px;
	}

	.voice-text-composer :global(.composer-tool) {
		width: 34px;
		height: 34px;
		border-radius: 12px;
	}

	.voice-text-composer :global(.send) {
		height: 38px;
		padding-inline: 13px;
	}

	.voice-typing-strip {
		position: absolute;
		left: 12px;
		bottom: calc(100% + 3px);
		z-index: 25;
		display: flex;
		align-items: center;
		gap: 6px;
		max-width: calc(100% - 24px);
		padding: 4px 8px;
		border: 1px solid rgba(255, 255, 255, 0.66);
		border-radius: 10px;
		background: rgba(222, 239, 247, 0.95);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		font-size: 11px;
		pointer-events: none;
	}

	.typing-avatars {
		display: flex;
		gap: 2px;
	}

	.typing-copy {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(html[data-theme='dark']) .voice-text-drawer {
		border-color: rgba(174, 221, 249, 0.15);
		background:
			radial-gradient(circle at 18% -8%, rgba(105, 202, 255, 0.1), transparent 34%),
			linear-gradient(150deg, rgba(23, 48, 65, 0.97), rgba(7, 29, 43, 0.96));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.1),
			0 26px 62px rgba(0, 0, 0, 0.46);
	}

	:global(html[data-theme='dark']) .voice-text-close {
		border-color: rgba(181, 222, 248, 0.12);
		background: rgba(75, 129, 158, 0.16);
	}

	:global(html[data-theme='dark']) .voice-typing-strip {
		border-color: #365064;
		background: #203340;
		color: #f4f6f7;
	}

	:global(html[data-ui-flat]) .voice-text-drawer {
		background: linear-gradient(155deg, rgba(241, 250, 255, 0.99), rgba(214, 237, 249, 0.99));
		box-shadow: 0 10px 28px rgba(3, 39, 72, 0.18);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		transition-duration: 100ms;
	}

	:global(html[data-ui-flat][data-theme='dark']) .voice-text-drawer {
		background: linear-gradient(155deg, rgba(31, 61, 78, 0.99), rgba(9, 32, 46, 0.99));
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
	}

	@media (max-width: 760px) {
		.voice-chat-overlay {
			position: absolute;
			inset: 0;
			z-index: 60;
			display: block;
			padding: 0;
			border: 0;
			background: rgba(4, 18, 31, 0.2);
			backdrop-filter: blur(8px);
			-webkit-backdrop-filter: blur(8px);
		}

		.voice-text-drawer {
			top: 6px;
			right: 6px;
			bottom: 6px;
			width: min(92vw, 420px);
			border-radius: 20px;
		}

		:global(html[data-ui-flat]) .voice-chat-overlay,
		:global(html[data-ui-mobile]) .voice-chat-overlay {
			background: rgba(4, 18, 31, 0.36);
			backdrop-filter: none;
			-webkit-backdrop-filter: none;
		}
	}

	@media (max-width: 430px) {
		.voice-text-drawer {
			left: 6px;
			width: auto;
		}

		.voice-text-head {
			padding-inline: 12px 9px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.voice-text-drawer {
			transition: none;
		}
	}
</style>

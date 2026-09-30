<script lang="ts">
	import { tick } from 'svelte';
	import type { MessageWithAttachment } from '$lib/types';
	import Message from './Message.svelte';

	let {
		messages,
		onReply,
		searchActive = false,
		loading = false,
		hasMoreNewer = false,
		hasMoreOlder = false,
		onJumpToLatest,
		onJumpToLastRead,
		onLoadMoreOlder,
		highlightMessageId = null,
		lastReadMessageId = null,
		joinNotice = null,
		scrollToLatestToken = 0,
		onUnreadCountChange
	} = $props<{
		messages: MessageWithAttachment[];
		onReply?: (message: MessageWithAttachment) => void;
		searchActive?: boolean;
		loading?: boolean;
		hasMoreNewer?: boolean;
		hasMoreOlder?: boolean;
		onJumpToLatest?: () => void | Promise<void>;
		onJumpToLastRead?: () => void | Promise<boolean>;
		onLoadMoreOlder?: () => void | Promise<void>;
		highlightMessageId?: string | null;
		lastReadMessageId?: string | null;
		joinNotice?: { id: number; name: string } | null;
		scrollToLatestToken?: number;
		onUnreadCountChange?: (count: number) => void;
	}>();

	const BOTTOM_THRESHOLD = 24;

	let listEl: HTMLElement | null = null;
	let contentEl: HTMLElement | null = null;
	let bottomEl: HTMLElement | null = null;

	let initialScrollDone = $state(false);
	let initializingPosition = false;
	let stickToBottom = $state(true);
	let unreadCount = $state(0);
	let loadingOlder = $state(false);
	let suppressScrollHandler = $state(true);

	let animatedMessageId = $state<string | null>(null);
	let lastMessageId = $state<string | null>(null);
	let visibleLastReadMessageId = $state<string | null>(null);
	let handledScrollToLatestToken = 0;

	function setUnreadCount(count: number): void {
		const next = Math.max(0, count);
		unreadCount = next;
		onUnreadCountChange?.(next);
	}

	function distanceFromBottom(): number {
		if (!listEl) return Number.POSITIVE_INFINITY;
		return Math.max(
			0,
			listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight
		);
	}

	function isAtBottom(): boolean {
		return distanceFromBottom() <= BOTTOM_THRESHOLD;
	}

	function scrollToBottom(): void {
		if (!listEl) return;

		// A real end sentinel is more reliable than assigning scrollHeight to
		// scrollTop, especially after images/media change intrinsic height.
		if (bottomEl) {
			bottomEl.scrollIntoView({
				block: 'end',
				inline: 'nearest',
				behavior: 'auto'
			});
		} else {
			listEl.scrollTop = listEl.scrollHeight;
		}

		// Clamp once more on the container. Fractional layout pixels and
		// scrollbar implementations differ between engines.
		listEl.scrollTop = listEl.scrollHeight;
	}

	function clearUnreadAtBottom(): void {
		stickToBottom = true;
		setUnreadCount(0);
		visibleLastReadMessageId = null;
	}

	function findLastReadDivider(id: string): HTMLElement | null {
		return (
			listEl?.querySelector<HTMLElement>(
				`[data-last-read-divider="${id}"]`
			) ?? null
		);
	}

	async function showLastReadBoundary(id: string): Promise<boolean> {
		let divider = findLastReadDivider(id);

		if (!divider && onJumpToLastRead) {
			const found = await onJumpToLastRead();
			if (!found) return false;
			await tick();
			divider = findLastReadDivider(id);
		}

		if (!divider) return false;

		visibleLastReadMessageId = id;
		await tick();
		divider = findLastReadDivider(id);
		divider?.scrollIntoView({
			block: 'center',
			inline: 'nearest',
			behavior: 'auto'
		});
		stickToBottom = false;
		return true;
	}

	async function initializePosition(): Promise<void> {
		if (
			initializingPosition ||
			initialScrollDone ||
			loading ||
			messages.length === 0
		) {
			return;
		}

		initializingPosition = true;
		await tick();

		try {
			const readId = lastReadMessageId;
			let positionedAtUnread = false;

			if (readId) {
				const readIndex = messages.findIndex((m) => m.id === readId);
				const unreadInWindow =
					readIndex >= 0 ? Math.max(0, messages.length - readIndex - 1) : 0;
				const hasUnreadAfter =
					(readIndex >= 0 && readIndex < messages.length - 1) || hasMoreNewer;

				if (hasUnreadAfter || readIndex < 0) {
					positionedAtUnread = await showLastReadBoundary(readId);
					if (positionedAtUnread) {
						setUnreadCount(
							Math.max(hasMoreNewer ? 1 : 0, unreadInWindow)
						);
					}
				}
			}

			if (!positionedAtUnread) {
				visibleLastReadMessageId = null;
				setUnreadCount(0);
				scrollToBottom();
				stickToBottom = true;
			}

			// Allow intrinsic media sizes to settle for two frames before user
			// scroll starts affecting the read state.
			await new Promise<void>((resolve) =>
				requestAnimationFrame(() =>
					requestAnimationFrame(() => resolve())
				)
			);

			if (stickToBottom) scrollToBottom();
			initialScrollDone = true;
			suppressScrollHandler = false;
			lastMessageId = messages.at(-1)?.id ?? null;
		} finally {
			initializingPosition = false;
		}
	}

	async function jumpToLatest(): Promise<void> {
		await onJumpToLatest?.();
		await tick();

		requestAnimationFrame(() => {
			scrollToBottom();
			clearUnreadAtBottom();
		});
	}

	async function jumpToUnread(): Promise<void> {
		const id = visibleLastReadMessageId;
		if (!id) {
			await jumpToLatest();
			return;
		}

		const found = await showLastReadBoundary(id);
		if (!found) await jumpToLatest();
	}

	function handleScroll(): void {
		if (!listEl || !initialScrollDone || suppressScrollHandler) return;

		const atBottom = isAtBottom();
		const wasAtBottom = stickToBottom;
		stickToBottom = atBottom;

		// Discord-like behavior: the NEW divider remains stable while reading
		// history and is consumed only when the user actually reaches the end.
		if (!wasAtBottom && atBottom) {
			clearUnreadAtBottom();
		}

		if (listEl.scrollTop < 200 && !atBottom) {
			void loadOlder();
		}
	}

	async function loadOlder(): Promise<void> {
		if (loadingOlder || !hasMoreOlder || !listEl) return;

		loadingOlder = true;
		const oldScrollTop = listEl.scrollTop;
		const oldScrollHeight = listEl.scrollHeight;

		try {
			await onLoadMoreOlder?.();
			await tick();
		} catch {
			loadingOlder = false;
			return;
		}

		requestAnimationFrame(() => {
			if (!listEl) {
				loadingOlder = false;
				return;
			}

			const added = listEl.scrollHeight - oldScrollHeight;
			if (added > 0) {
				listEl.scrollTop = oldScrollTop + added;
			}
			loadingOlder = false;
		});
	}

	// Initial Discord-like positioning: first unread when there is an unread
	// boundary, otherwise the real bottom.
	$effect(() => {
		const count = messages.length;
		const isLoading = loading;
		const readId = lastReadMessageId;
		const newer = hasMoreNewer;
		void count;
		void isLoading;
		void readId;
		void newer;
		void initializePosition();
	});

	// Detect newly appended messages without moving a user who is reading
	// history. The first new message establishes a NEW divider at the previous
	// last message if no divider is currently visible.
	$effect(() => {
		const currentLastId = messages.at(-1)?.id ?? null;

		if (!currentLastId) {
			lastMessageId = null;
			return;
		}
		if (!initialScrollDone) return;
		if (!lastMessageId) {
			lastMessageId = currentLastId;
			return;
		}
		if (currentLastId === lastMessageId) return;

		const previousLastId = lastMessageId;
		animatedMessageId = currentLastId;

		if (!stickToBottom) {
			if (!visibleLastReadMessageId) {
				visibleLastReadMessageId = previousLastId;
			}

			const previousIndex = messages.findIndex((m) => m.id === previousLastId);
			const addedCount =
				previousIndex >= 0
					? Math.max(1, messages.length - previousIndex - 1)
					: 1;
			setUnreadCount(unreadCount + addedCount);
		}

		lastMessageId = currentLastId;
	});

	// If already at the end, follow new messages.
	$effect(() => {
		const count = messages.length;
		if (!initialScrollDone || !stickToBottom || count === 0) return;

		void tick().then(() => {
			requestAnimationFrame(() => scrollToBottom());
		});
	});

	// Keep the real bottom pinned when media loads or layout changes. This
	// avoids the common "almost at bottom" state after lazy images/videos.
	$effect(() => {
		const list = listEl;
		const content = contentEl;
		if (!list || !content) return;

		let frame = 0;
		const settleBottom = () => {
			if (!initialScrollDone || !stickToBottom) return;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => scrollToBottom());
		};

		const observer =
			typeof ResizeObserver !== 'undefined'
				? new ResizeObserver(settleBottom)
				: null;
		observer?.observe(content);

		// Capture resource load events as a fallback and as an extra signal for
		// engines that batch ResizeObserver notifications differently.
		list.addEventListener('load', settleBottom, true);
		list.addEventListener('loadedmetadata', settleBottom, true);
		window.addEventListener('resize', settleBottom);

		return () => {
			cancelAnimationFrame(frame);
			observer?.disconnect();
			list.removeEventListener('load', settleBottom, true);
			list.removeEventListener('loadedmetadata', settleBottom, true);
			window.removeEventListener('resize', settleBottom);
		};
	});

	$effect(() => {
		const token = scrollToLatestToken;
		if (!initialScrollDone || token <= handledScrollToLatestToken) return;
		handledScrollToLatestToken = token;
		void jumpToLatest();
	});

	$effect(() => {
		if (!highlightMessageId) return;

		queueMicrotask(() => {
			const el = listEl?.querySelector<HTMLElement>(
				`[data-message-id="${highlightMessageId}"]`
			);

			el?.scrollIntoView({
				block: 'nearest',
				inline: 'nearest',
				behavior: 'auto'
			});
		});
	});
</script>

<div class="chat-wrapper">
	{#if loadingOlder}
		<div class="older-loading" aria-hidden="true">Carregando…</div>
	{/if}

	<div
		class="chat"
		class:ready={messages.length === 0 || initialScrollDone}
		bind:this={listEl}
		onscroll={handleScroll}
	>
		<div class="chat-content" bind:this={contentEl}>
		{#if hasMoreNewer}
			<button
				class="jump-to-latest"
				onclick={jumpToLatest}
				aria-label="Ir para as últimas mensagens"
			>
				↓ Ver últimas mensagens
			</button>
		{/if}

		{#if loading && messages.length === 0}
			<div class="chat-empty">
				<p>Carregando…</p>
			</div>
		{:else if messages.length === 0}
			<div class="chat-empty">
				<p>
					{searchActive
						? 'Nada encontrado.'
						: 'Nenhuma mensagem por enquanto.'}
				</p>
			</div>
		{:else}
			{#each messages as m, index (m.id)}
				<div
					class:message-enter={m.id === animatedMessageId}
					class:message-target-highlight={m.id === highlightMessageId}
				>
					<Message
						message={m}
						onReply={(msg) => onReply?.(msg)}
					/>
				</div>
				{#if m.id === visibleLastReadMessageId && (index < messages.length - 1 || hasMoreNewer)}
					<div class="last-read-divider" data-last-read-divider={m.id}>
						<span>Novas mensagens</span>
					</div>
				{/if}
			{/each}
		{/if}
			<div class="chat-bottom-anchor" bind:this={bottomEl} aria-hidden="true"></div>
		</div>
	</div>

	{#if joinNotice}{#key joinNotice.id}<div class="join-notice" role="status">{joinNotice.name} entrou no servidor</div>{/key}{/if}

	{#if unreadCount > 0}
		<button
			class="new-messages-bubble"
			onclick={jumpToUnread}
		>
			↑ {unreadCount}
			{unreadCount === 1
				? 'nova mensagem'
				: 'novas mensagens'}
		</button>
	{/if}
</div>

<style>
	.chat-wrapper {
		position: relative;
		flex: 1 1 0;
		min-height: 0;
		overflow: hidden;
	}

	.chat {
		height: 100%;
		min-height: 0;
		overflow-y: auto;
		display: block;
	}

	.chat-content {
		min-height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
	}

	.chat-bottom-anchor {
		flex: 0 0 1px;
		width: 1px;
		height: 1px;
		pointer-events: none;
	}

	.older-loading {
		position: absolute;
		top: 8px;
		left: 0;
		right: 0;
		z-index: 5;

		display: flex;
		align-items: center;
		justify-content: center;

		font-size: 13px;
		font-weight: 600;
		color: var(--muted-soft);
		pointer-events: none;
	}

	.new-messages-bubble {
		position: absolute;
		left: 50%;
		bottom: 12px;
		transform: translateX(-50%);
		z-index: 20;

		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;

		padding: 7px 14px;
		border: 1px solid var(--border);
		border-radius: 999px;

		background: var(--surface);
		color: var(--text-primary);

		font: inherit;
		font-size: 13px;
		font-weight: 600;

		cursor: pointer;
		box-shadow: 0 4px 14px rgb(0 0 0 / 0.18);
		white-space: nowrap;
	}

	.new-messages-bubble:hover { background: var(--hover); }
	.join-notice{position:absolute;left:50%;bottom:52px;z-index:21;transform:translateX(-50%);padding:7px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-primary);font-size:12px;font-weight:650;box-shadow:0 4px 14px rgb(0 0 0/.16);white-space:nowrap;pointer-events:none;animation:join-life 4.5s ease forwards}@keyframes join-life{0%{opacity:0}10%,80%{opacity:1}100%{opacity:0}}

	.message-target-highlight {
		border-radius: 12px;
		background: linear-gradient(90deg, rgba(10, 132, 255, 0.2), rgba(90, 200, 250, 0.08));
		box-shadow:
			inset 3px 0 0 rgba(10, 132, 255, 0.9),
			0 0 0 1px rgba(10, 132, 255, 0.14);
		animation: target-highlight-pulse 0.55s ease-out;
	}

	.message-target-highlight :global(.attachment-image img),
	.message-target-highlight :global(.attachment-media),
	.message-target-highlight :global(.attachment-file) {
		box-shadow:
			0 0 0 2px rgba(10, 132, 255, 0.72),
			0 0 0 5px rgba(10, 132, 255, 0.12);
		border-radius: 11px;
	}

	:global([data-theme='dark']) .message-target-highlight :global(.attachment-image img),
	:global([data-theme='dark']) .message-target-highlight :global(.attachment-media),
	:global([data-theme='dark']) .message-target-highlight :global(.attachment-file) {
		box-shadow:
			0 0 0 2px rgba(91, 196, 255, 0.78),
			0 0 0 5px rgba(91, 196, 255, 0.1);
	}

	:global([data-theme='dark']) .message-target-highlight {
		background: linear-gradient(90deg, rgba(50, 159, 226, 0.2), rgba(22, 83, 122, 0.08));
		box-shadow:
			inset 3px 0 0 rgba(91, 196, 255, 0.88),
			0 0 0 1px rgba(91, 196, 255, 0.12);
	}

	@keyframes target-highlight-pulse {
		from {
			background-color: rgba(10, 132, 255, 0.34);
		}
		to {
			background-color: transparent;
		}
	}

	.last-read-divider {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 8px 0;

		color: var(--accent);
		font-size: 12px;
		font-weight: 600;
	}

	.last-read-divider::before,
	.last-read-divider::after {
		content: '';
		height: 1px;
		flex: 1;
		background: currentColor;
		opacity: 0.65;
	}
</style>
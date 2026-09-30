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

	let listEl: HTMLElement | null = null;

	let initialScrollDone = $state(false);
	let stickToBottom = $state(true);
	let unreadCount = $state(0);
	let initialUnreadSeeded = $state(false);
	let loadingOlder = $state(false);

	let animatedMessageId = $state<string | null>(null);
	let lastMessageId = $state<string | null>(null);

	function setUnreadCount(count: number) {
		unreadCount = count;
		onUnreadCountChange?.(count);
	}
	let visibleLastReadMessageId = $state<string | null>(null);
	let syncedLastReadMessageId = $state<string | null>(null);
	let suppressScrollHandler = $state(true);
	

	$effect(() => {
		const id = lastReadMessageId;

		if (id !== syncedLastReadMessageId) {
			syncedLastReadMessageId = id;
			visibleLastReadMessageId = id;
		}
		if (lastReadMessageId) {
			visibleLastReadMessageId = lastReadMessageId;
		}
	});

	function scrollToBottom() {
		if (!listEl) return;

		const previous = listEl.style.scrollBehavior;

		listEl.style.scrollBehavior = 'auto';
		listEl.scrollTop = listEl.scrollHeight;

		requestAnimationFrame(() => {
			if (!listEl) return;

			listEl.scrollTop = listEl.scrollHeight;
			listEl.style.scrollBehavior = previous;
		});
	}

	async function jumpToLatest() {
		await onJumpToLatest?.();
		await tick();

		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				scrollToBottom();

				stickToBottom = true;
				setUnreadCount(0);
				visibleLastReadMessageId = null;
			});
		});
	}

	async function jumpToUnread(){if(!visibleLastReadMessageId){await jumpToLatest();return;}let target=listEl?.querySelector<HTMLElement>(`[data-message-id="${visibleLastReadMessageId}"]`);if(!target&&onJumpToLastRead){await onJumpToLastRead();await tick();target=listEl?.querySelector<HTMLElement>(`[data-message-id="${visibleLastReadMessageId}"]`)??null;}if(!target){await jumpToLatest();return;}target.scrollIntoView({block:'center',behavior:'auto'});stickToBottom=false;}

	function handleScroll() {
		if (!listEl || !initialScrollDone || suppressScrollHandler) return;

		const distanceFromTop = listEl.scrollTop;
		const distanceFromBottom =
			listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;

		const wasAtBottom = stickToBottom;

		stickToBottom = distanceFromBottom < 120;

		if (!wasAtBottom && stickToBottom) {
			setUnreadCount(0);
			visibleLastReadMessageId = null;
		}

		// Infinite scroll: load older messages when close to the top of the
		// list and not anchored to the bottom.
		if (distanceFromTop < 200 && !stickToBottom) {
			void loadOlder();
		}
	}

	// Loads the next older page and keeps the viewport pinned (scroll
	// compensation for the content prepended above the current view).
	async function loadOlder(): Promise<void> {
		if (loadingOlder || !hasMoreOlder || !listEl) return;
		loadingOlder = true;
		const oldScrollTop = listEl.scrollTop;
		const oldScrollHeight = listEl.scrollHeight;
		try {
			await onLoadMoreOlder?.();
			// Wait for the new messages to render, then compensate the scroll.
			await tick();
		} catch {
			loadingOlder = false;
			return;
		}
		requestAnimationFrame(() => {
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
		});
	}

	// Pai pediu explicitamente para ir ao final.
	$effect(() => {
		const count = messages.length;

		if (loading) return;
		if (count === 0) return;
		if (initialScrollDone) return;

		(async () => {
			await tick();

			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					scrollToBottom();
					initialScrollDone = true;

					// Só depois do scroll automático estabilizar,
					// começa a considerar scroll do usuário.
					requestAnimationFrame(() => {
						suppressScrollHandler = false;
					});
				});
			});
		})();
	});

	$effect(()=>{if(loading||!initialScrollDone||initialUnreadSeeded)return;initialUnreadSeeded=true;if(!lastReadMessageId)return;const idx=messages.findIndex((m)=>m.id===lastReadMessageId);setUnreadCount(idx>=0?Math.max(0,messages.length-idx-1):messages.length);});

	// Detecta mensagem nova.
	$effect(() => {
		const currentLastId = messages.at(-1)?.id ?? null;

		if (!currentLastId) {
			lastMessageId = null;
			return;
		}

		// Primeira carga.
		if (!initialScrollDone) {
			lastMessageId = currentLastId;
			return;
		}

		if (!lastMessageId) {
			lastMessageId = currentLastId;
			return;
		}

		if (currentLastId === lastMessageId) return;

		animatedMessageId = currentLastId;

		// Usuário está lendo mensagens antigas.
		if (!stickToBottom) {
			const previousIndex = messages.findIndex(
				(message:MessageWithAttachment) => message.id === lastMessageId
			);

			const addedCount =
				previousIndex >= 0
					? messages.length - previousIndex - 1
					: 1;

			if (addedCount > 0) {
				setUnreadCount(unreadCount + addedCount);
			}
		}

		lastMessageId = currentLastId;
	});

	// Scroll inicial.
	$effect(() => {
		const count = messages.length;

		if (loading) return;
		if (count === 0) return;
		if (initialScrollDone) return;

		(async () => {
			await tick();

			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					scrollToBottom();
					initialScrollDone = true;
				});
			});
		})();
	});

	// Se já estava no final, acompanha novas mensagens.
	$effect(() => {
		const count = messages.length;

		if (!initialScrollDone) return;
		if (!stickToBottom) return;
		if (count === 0) return;

		(async () => {
			await tick();

			requestAnimationFrame(() => {
				scrollToBottom();
			});
		})();
	});

	// Scroll para mensagem específica.
	$effect(() => {
		if (!highlightMessageId) return;

		queueMicrotask(() => {
			const el = listEl?.querySelector<HTMLElement>(
				`[data-message-id="${highlightMessageId}"]`
			);

			el?.scrollIntoView({
				block: 'nearest',
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
				{#if m.id === visibleLastReadMessageId && index < messages.length - 1}
					<div class="last-read-divider">
						<span>Novas mensagens</span>
					</div>
				{/if}
			{/each}
		{/if}
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
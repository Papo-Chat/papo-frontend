<script lang="ts">
	// Notifications popover (topbar, right-anchored). Open/closed via the UI
	// store. Closes on outside click, Escape, or the close button.
	//
	// Data: notificationsStore (GET /users/:id/notifications). Clicking an
	// item marks it read and navigates to the channel, highlighting the
	// referenced message (scrollTarget mechanism, same as search).
	import { goto } from '$app/navigation';
	import { state, setScrollTarget } from '$lib/store/ui.svelte';
	import * as notificationsStore from '$lib/store/notifications.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import * as messagesStore from '$lib/store/messages.svelte';
	import { formatTime } from '$lib/utils/time';
	import type { NotificationSummary } from '$lib/types';
	import Icon from './Icon.svelte';
	import Avatar from './Avatar.svelte';
	import CompactMessageContent from './CompactMessageContent.svelte';

	let el: HTMLElement | null = null;
	let open = $derived(state.notificationsPopoverOpen);

	function close(): void {
		state.notificationsPopoverOpen = false;
	}

	$effect(() => {
		if (!open) return;
		const ids = notificationsStore.state.items
			.map((notification) => notification.author_id)
			.filter((id): id is string => !!id);
		if (ids.length) void usersStore.ensureSummaries(ids).catch(() => {});
	});

	// Scroll-based loading: while the user scrolls the body towards the
	// bottom (distance < 200px) and there are more pages, load the next.
	// Replaces a "show more" button (no click, same as the chat messages).
	function onBodyScroll(e: Event): void {
		const sc = e.target as HTMLElement;
		const distance = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
		if (
			distance < 200 &&
			!notificationsStore.state.loading &&
			notificationsStore.state.hasMore
		) {
			notificationsStore.loadMore();
		}
	}

	function interactiveTarget(target: EventTarget | null): boolean {
		return !!(target as HTMLElement | null)?.closest(
			'button, a, input, select, textarea, video, audio, [role="slider"]'
		);
	}

	function openNotification(n: NotificationSummary): void {
		notificationsStore.markRead([n.id]);
		setScrollTarget(n.message_id, n.created_at);
		goto(`/channels/${n.channel_id}`);
		close();
	}

	$effect(() => {
		if (!open) return;
		function onPointerDown(e: PointerEvent): void {
			if (el && !el.contains(e.target as Node)) close();
		}
		function onKeyDown(e: KeyboardEvent): void {
			if (e.key === 'Escape') close();
		}
		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	});
</script>

{#if open}
	<div class="header-popover notifications-popover open" bind:this={el}>
		<div class="popover-head">
			<div class="popover-title">
				<Icon name="bell" variant="light" />
				<strong>Notificações</strong>
			</div>
			<button class="popover-close" onclick={close} aria-label="Fechar">
				<Icon name="x" variant="light" />
			</button>
		</div>
		<div class="popover-body" onscroll={onBodyScroll}>
			{#if notificationsStore.state.items.length}
				{#each notificationsStore.state.items as n (n.id)}
					{@const author = usersStore.state.byId.get(n.author_id ?? '')}
					{@const cachedMessage = messagesStore.getMessage(n.channel_id, n.message_id)}
					<div
							class="popover-item notification-item {!n.read ? 'unread' : ''}"
							role="button"
							tabindex={0}
							onclick={(e) => {
								if (!interactiveTarget(e.target)) openNotification(n);
							}}
							onkeydown={(e: KeyboardEvent) => {
								if (
									(e.key === 'Enter' || e.key === ' ') &&
									e.target === e.currentTarget
								) {
									e.preventDefault();
									openNotification(n);
								}
							}}
						>
							<Avatar user={author} userId={n.author_id} size={34} />
							<div class="notification-main">
								<div class="meta">
									<span class="name">{author?.nickname || author?.username || 'Usuário'}</span>
									<span class="time">{formatTime(n.created_at)}</span>
									{#if !n.read}
										<span class="unread-dot" aria-hidden="true"></span>
									{/if}
								</div>
								<div class="notification-content">
									<CompactMessageContent
										content={n.message_content}
										message={cachedMessage}
									/>
								</div>
							</div>
						</div>
				{/each}
			{:else}
				<div class="popover-empty-icon">
					<Icon name="bell-ringing" variant="duotone" />
				</div>
				<strong>Nada por enquanto</strong>
				<p>Menções, reações e outros avisos aparecerão aqui.</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.unread-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--danger);
		margin-left: 6px;
		vertical-align: middle;
	}

	.notifications-popover .popover-body {
		justify-items: stretch;
	}

	.notification-item {
		width: 100%;
		box-sizing: border-box;
		align-items: flex-start;
		cursor: pointer;
	}

	.notification-main {
		flex: 1;
		min-width: 0;
	}

	.notification-content {
		min-width: 0;
		overflow-wrap: anywhere;
		line-height: 1.42;
	}

	.notification-item.unread {
		background: linear-gradient(145deg, rgba(89, 190, 245, 0.18), rgba(57, 143, 213, 0.08));
		border-color: rgba(72, 168, 228, 0.34);
		box-shadow: inset 3px 0 0 rgba(10, 132, 255, 0.74);
	}

	.notification-item:hover,
	.notification-item:focus-visible {
		background: rgba(255, 255, 255, 0.3);
		border-color: rgba(255, 255, 255, 0.44);
		outline: none;
	}

	:global([data-theme='dark']) .notification-item.unread {
		background: linear-gradient(145deg, rgba(50, 153, 220, 0.18), rgba(21, 88, 133, 0.12));
		border-color: rgba(99, 196, 246, 0.22);
	}

	:global([data-theme='dark']) .notification-item:hover,
	:global([data-theme='dark']) .notification-item:focus-visible {
		background: rgba(119, 194, 235, 0.1);
	}
</style>

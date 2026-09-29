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
	import { formatTime } from '$lib/utils/time';
	import type { NotificationSummary } from '$lib/types';
	import Icon from './Icon.svelte';
	import Avatar from './Avatar.svelte';

	let el: HTMLElement | null = null;
	let open = $derived(state.notificationsPopoverOpen);

	function close(): void {
		state.notificationsPopoverOpen = false;
	}

	function openNotification(n: NotificationSummary): void {
		notificationsStore.markRead([n.id]);
		setScrollTarget(n.message_id);
		goto(`/channels/${n.channel_id}`);
		close();
	}

	$effect(() => {
		if (!open) return;
		// Perfis dos autores das notificações visíveis (batch, só ids ausentes
		// do cache). Sem isso, autor ainda não em byId não renderiza o item.
		const ids = notificationsStore.state.items
			.map((n) => n.author_id)
			.filter((id): id is string => id !== null && id !== '');
		void usersStore.ensureProfiles(ids);

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
		<div class="popover-body">
			{#if notificationsStore.state.items.length}
				{#each notificationsStore.state.items as n (n.id)}
					{@const author = usersStore.state.byId.get(n.author_id ?? '')}
					{#if author}
						<div
							class="popover-item"
							role="button"
							tabindex={0}
							onclick={() => openNotification(n)}
							onkeydown={(e: KeyboardEvent) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									openNotification(n);
								}
							}}
						>
							<Avatar user={author} size={34} />
							<div>
								<div class="meta">
									<span class="name">{author.nickname || author.username}</span>
									<span class="time">{formatTime(n.created_at)}</span>
									{#if !n.read}
										<span class="unread-dot" aria-hidden="true"></span>
									{/if}
								</div>
								<div class="content">{n.message_content}</div>
							</div>
						</div>
					{/if}
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
</style>

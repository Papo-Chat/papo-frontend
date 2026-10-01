<script lang="ts">
	// Pinned-messages popover (topbar, right-anchored). Open/closed via the UI
	// store. Closes on outside click, Escape, or the close button.
	//
	// Data: pinned list of the current (open) channel — messagesStore.getChannel(
	// openChannelId)?.pinned (GET /channels/:id/pinned). Clicking a pin
	// navigates/highlights the message (scrollTarget mechanism, same as search).
	import { goto } from '$app/navigation';
	import { state, setScrollTarget } from '$lib/store/ui.svelte';
	import * as channelsStore from '$lib/store/channels.svelte';
	import * as messagesStore from '$lib/store/messages.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import type { MessageWithAttachment } from '$lib/types';
	import { formatTime } from '$lib/utils/time';
	import Icon from './Icon.svelte';
	import Avatar from './Avatar.svelte';
	import CompactMessageContent from './CompactMessageContent.svelte';

	let {
		channelId = null,
		routePrefix = 'channels'
	} = $props<{
		channelId?: string | null;
		routePrefix?: 'channels' | 'dm';
	}>();

	let el: HTMLElement | null = null;
	let open = $derived(state.pinsPopoverOpen);

	const openChannelId = $derived(channelId ?? channelsStore.state.openChannelId);
	const pinned = $derived(
		openChannelId ? (messagesStore.getChannel(openChannelId)?.pinned ?? []) : []
	);

	function close(): void {
		state.pinsPopoverOpen = false;
	}

	$effect(() => {
		const ids = pinned.map((message) => message.author_id).filter((id): id is string => !!id);
		if (ids.length) void usersStore.ensureSummaries(ids).catch(() => {});
	});

	function interactiveTarget(target: EventTarget | null): boolean {
		return !!(target as HTMLElement | null)?.closest(
			'button, a, input, select, textarea, video, audio, [role="slider"]'
		);
	}

	function openPin(m: MessageWithAttachment): void {
		setScrollTarget(m.id, m.created_at);
		goto(`/${routePrefix}/${m.channel_id}`);
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
	<div class="header-popover pins-popover open" bind:this={el}>
		<div class="popover-head">
			<div class="popover-title">
				<Icon name="push-pin" variant="light" />
				<strong>Fixadas</strong>
			</div>
			<button class="popover-close" onclick={close} aria-label="Fechar">
				<Icon name="x" variant="light" />
			</button>
		</div>
		<div class="popover-body">
			{#if pinned.length}
				{#each pinned as m (m.id)}
					{@const author = usersStore.state.byId.get(m.author_id ?? '')}
					<div
							class="popover-item pin-item"
							role="button"
							tabindex={0}
							onclick={(e) => {
								if (!interactiveTarget(e.target)) openPin(m);
							}}
							onkeydown={(e: KeyboardEvent) => {
								if (
									(e.key === 'Enter' || e.key === ' ') &&
									e.target === e.currentTarget
								) {
									e.preventDefault();
									openPin(m);
								}
							}}
						>
							<Avatar user={author} userId={m.author_id} size={34} />
							<div class="pin-main">
								<div class="meta">
									<span class="name">{author?.nickname || author?.username || 'Usuário'}</span>
									<span class="time">{formatTime(m.created_at)}</span>
								</div>
								<CompactMessageContent message={m} pinned />
							</div>
							<span class="pin-badge" aria-hidden="true"><Icon name="push-pin" variant="duotone" size={13} /></span>
						</div>
				{/each}
			{:else}
				<div class="popover-empty-icon">
					<Icon name="push-pin" variant="duotone" />
				</div>
				<strong>Fixadas</strong>
				<p>
					Nenhuma mensagem fixada nesta conversa. Passar o mouse sobre uma mensagem e clicar no
					alfinete para fixá-la.
				</p>
			{/if}
		</div>
	</div>
{/if}


<style>
	.pins-popover .popover-body {
		justify-items: stretch;
	}

	.pin-item {
		position: relative;
		width: 100%;
		box-sizing: border-box;
		align-items: flex-start;
		padding-right: 38px;
		cursor: pointer;
		background: linear-gradient(145deg, rgba(255, 246, 211, 0.2), rgba(255, 226, 128, 0.08));
		border-color: rgba(224, 174, 55, 0.2);
	}

	.pin-main {
		flex: 1;
		min-width: 0;
	}

	.pin-badge {
		position: absolute;
		top: 10px;
		right: 10px;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 8px;
		color: #a87500;
		background: rgba(231, 168, 11, 0.14);
		border: 1px solid rgba(231, 168, 11, 0.22);
	}

	.pin-item:hover,
	.pin-item:focus-visible {
		background: linear-gradient(145deg, rgba(255, 244, 199, 0.34), rgba(244, 198, 71, 0.14));
		border-color: rgba(224, 174, 55, 0.36);
		outline: none;
	}

	:global([data-theme='dark']) .pin-item {
		background: linear-gradient(145deg, rgba(201, 150, 34, 0.12), rgba(105, 78, 13, 0.08));
		border-color: rgba(235, 190, 78, 0.16);
	}

	:global([data-theme='dark']) .pin-badge {
		color: #ffd66d;
		background: rgba(231, 168, 11, 0.14);
	}
</style>

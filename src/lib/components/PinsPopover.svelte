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

	let el: HTMLElement | null = null;
	let open = $derived(state.pinsPopoverOpen);

	const openChannelId = $derived(channelsStore.state.openChannelId);
	const pinned = $derived(
		openChannelId ? (messagesStore.getChannel(openChannelId)?.pinned ?? []) : []
	);

	function close(): void {
		state.pinsPopoverOpen = false;
	}

	function openPin(m: MessageWithAttachment): void {
		setScrollTarget(m.id, m.created_at);
		goto(`/channels/${m.channel_id}`);
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
					{#if author}
						<div
							class="popover-item"
							role="button"
							tabindex={0}
							onclick={() => openPin(m)}
							onkeydown={(e: KeyboardEvent) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									openPin(m);
								}
							}}
						>
							<Avatar user={author} size={34} />
							<div>
								<div class="meta">
									<span class="name">{author.nickname || author.username}</span>
									<span class="time">{formatTime(m.created_at)}</span>
								</div>
								{#if m.content}
									<div class="content">{m.content}</div>
								{:else}
									{#if m.previews.length}
										<div class="content">{m.previews[0].title}</div>
									{/if}
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			{:else}
				<div class="popover-empty-icon">
					<Icon name="push-pin" variant="duotone" />
				</div>
				<strong>Fixadas</strong>
				<p>
					Nenhuma mensagem fixada neste canal. Passar o mouse sobre uma mensagem e clicar no
					alfinete para fixá-la.
				</p>
			{/if}
		</div>
	</div>
{/if}

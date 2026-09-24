<script lang="ts">
	// Notifications popover (topbar, right-anchored). Open/closed via the UI
	// store. Closes on outside click, Escape, or the close button.
	import { state } from '$lib/store/ui.svelte';
	import { sampleNotifications, userById } from '$lib/sample';
	import { formatTime } from '$lib/utils/time';
	import Icon from './Icon.svelte';
	import Avatar from './Avatar.svelte';

	let el: HTMLElement | null = null;
	let open = $derived(state.notificationsPopoverOpen);

	function close(): void {
		state.notificationsPopoverOpen = false;
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
			<button class="popover-close" on:click={close} aria-label="Fechar">
				<Icon name="x" variant="light" />
			</button>
		</div>
		<div class="popover-body">
			{#if sampleNotifications.length}
				{#each sampleNotifications as n (n.id)}
					{@const author = userById(n.author_id)}
					{#if author}
						<div class="popover-item">
							<Avatar username={author.username} nickname={author.nickname} size={34} />
							<div>
								<div class="meta">
									<span class="name">{author.nickname || author.username}</span>
									<span class="time">{formatTime(n.created_at)}</span>
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
				<p>
					Use este espaço como base para um centro de notificações com menções, reações, avisos e
					atualizações da comunidade.
				</p>
			{/if}
		</div>
	</div>
{/if}

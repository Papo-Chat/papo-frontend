<script lang="ts">
	// Pinned-messages popover (topbar, right-anchored). Open/closed via the UI
	// store. Closes on outside click, Escape, or the close button.
	import { state } from '$lib/store/ui.svelte';
	import { samplePins, userById } from '$lib/sample';
	import { formatTime } from '$lib/utils/time';
	import Icon from './Icon.svelte';
	import Avatar from './Avatar.svelte';

	let el: HTMLElement | null = null;
	let open = $derived(state.pinsPopoverOpen);

	function close(): void {
		state.pinsPopoverOpen = false;
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
			<button class="popover-close" on:click={close} aria-label="Fechar">
				<Icon name="x" variant="light" />
			</button>
		</div>
		<div class="popover-body">
			{#if samplePins.length}
				{#each samplePins as m (m.id)}
					{@const author = userById(m.author_id)}
					{#if author}
						<div class="popover-item">
							<Avatar
								username={author.username}
								nickname={author.nickname}
								size={34}
							/>
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
				<strong>Mensagens fixadas</strong>
				<p>
					Base pronta para listar mensagens, arquivos e links importantes
					do canal atual com o mesmo visual Liquid Glass.
				</p>
			{/if}
		</div>
	</div>
{/if}

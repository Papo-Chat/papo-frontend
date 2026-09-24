<script lang="ts">
	// Search popover (topbar, right-anchored like the other header popovers).
	// Open/closed via props (bindable). Closes on outside click, Escape, or the
	// close button. Filters the channel's messages by content (demo only).
	import { sampleMessages, userById } from '$lib/sample';
	import { formatTime } from '$lib/utils/time';
	import Icon from './Icon.svelte';
	import Avatar from './Avatar.svelte';

	let {
		open = $bindable(false),
		searchQuery = $bindable(''),
		onOpenChange
	} = $props<{
		open?: boolean;
		searchQuery?: string;
		onOpenChange?: (open: boolean) => void;
	}>();

	let el: HTMLElement | null = null;
	let inputEl: HTMLInputElement | null = null;

	const results = $derived(
		sampleMessages.filter((m) => {
			const query = searchQuery.trim().toLowerCase();
			if (!query) return false;
			return (m.content ?? '').toLowerCase().includes(query);
		})
	);

	function close(): void {
		if (open) {
			open = false;
			onOpenChange?.(false);
			// Clearing the query so the chat returns to the full list.
			searchQuery = '';
		}
	}

	// Autofocus the input when the popover opens.
	$effect(() => {
		if (!open) return;
		queueMicrotask(() => {
			inputEl?.focus();
			inputEl?.select();
		});
	});

	// Close on outside click + Escape. Listeners only exist while open.
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
	<div class="header-popover search-popover open" bind:this={el}>
		<div class="popover-head">
			<div class="popover-title">
				<Icon name="magnifying-glass" variant="light" />
				<strong>Pesquisar</strong>
			</div>
			<button class="popover-close" onclick={close} aria-label="Fechar">
				<Icon name="x" variant="light" />
			</button>
		</div>

		<div class="popover-body">
			<input
				class="admin-input"
				type="text"
				placeholder="Pesquisar mensagens…"
				bind:this={inputEl}
				bind:value={searchQuery}
				aria-label="Pesquisar mensagens"
			/>

			{#if searchQuery.trim()}
				<div class="search-count">
					{results.length}
					{results.length === 1 ? 'resultado' : 'resultados'}
				</div>
				{#if results.length}
					{#each results as m (m.id)}
						{@const author = userById(m.author_id)}
						{#if author}
							<div class="popover-item">
								<Avatar username={author.username} nickname={author.nickname} size={34} />
								<div>
									<div class="meta">
										<span class="name">{author.nickname || author.username}</span>
										<span class="time">{formatTime(m.created_at)}</span>
									</div>
									{#if m.content}
										<div class="content">{m.content}</div>
									{/if}
								</div>
							</div>
						{/if}
					{/each}
				{:else}
					<div class="popover-empty">
						<div class="popover-empty-icon">
							<Icon name="magnifying-glass" variant="duotone" />
						</div>
						<strong>Nada encontrado</strong>
						<p>Nenhuma mensagem contém “{searchQuery.trim()}”.</p>
					</div>
				{/if}
			{:else}
				<div class="popover-empty">
					<div class="popover-empty-icon">
						<Icon name="magnifying-glass" variant="duotone" />
					</div>
					<strong>Pesquisar</strong>
					<p>Digite um termo para encontrar mensagens deste canal.</p>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.search-input {
		width: 100%;
		height: 42px;
		padding: 0 14px;
		border-radius: 12px;
		border: 1px solid rgba(76, 132, 170, 0.22);
		background: linear-gradient(145deg, rgba(255, 255, 255, 0.72), rgba(238, 248, 253, 0.62));
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
		font: inherit;
		color: var(--text);
		outline: 0;
		transition:
			box-shadow 0.18s ease,
			border-color 0.18s ease;
	}
	.search-input:focus {
		box-shadow: 0 0 0 3px rgba(56, 167, 235, 0.18);
		border-color: rgba(100, 196, 250, 0.6);
	}
	.search-input::placeholder {
		color: var(--muted-soft);
	}
	.search-count {
		display: block;
		margin: 10px 2px 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted);
	}
</style>

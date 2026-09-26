<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		backgroundId,
		setBackground,
		deviceImages,
		defaultBackground
	} from '$lib/store/background.svelte';

	let open = false;

	function toggleOpen() {
		open = !open;
	}

	function close() {
		open = false;
	}

	function onDocumentClick(e: MouseEvent): void {
		if (!open) return;
		const el = e.target instanceof Element ? e.target : null;
		if (el?.closest('.bg-control') || el?.closest('.bg-picker')) return;
		close();
	}

	onMount(() => {
		document.addEventListener('click', onDocumentClick);
	});

	onDestroy(() => {
		document.removeEventListener('click', onDocumentClick);
	});
</script>

<button
	class="bg-control"
	on:click={toggleOpen}
	aria-label="Mudar fundo"
	title="Mudar fundo"
>
</button>

{#if open}
	<div class="bg-picker">
		<div class="bg-picker-header">
			<h3>Fundo</h3>
			<button class="bg-picker-close" on:click={close} aria-label="Fechar">×</button>
		</div>
		<div class="bg-picker-grid">
			{#each deviceImages as img (img.id)}
				<button
					class="bg-option {$backgroundId === img.id ? 'selected' : ''}"
					on:click={() => { setBackground(img.id); close(); }}
					style="background: {img.background || defaultBackground}"
					aria-label={img.label}
				>
					<span class="bg-option-label">{img.label}</span>
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	/* small triangular corner (dog-ear) at the bottom-right tip of the page.
	 * Subtle gradual contrast change using theme colors. No animation. */
	.bg-control {
		position: fixed;
		bottom: 0;
		right: 0;
		z-index: 999;

		width: 34px;
		height: 34px;

		border: none;
		cursor: pointer;

		clip-path: polygon(100% 0, 100% 100%, 0 100%);

		background: radial-gradient(
			circle at 100% 100%,
			var(--glass-soft) 80%,
			transparent 15%,
			transparent 0%
		);

		transition:
			filter 0.2s var(--ease),
			transform 0.2s var(--ease);
	}@media (max-width: 1600px) {
		:global(.bg-control) {
			display: none;
		}
	}
	.bg-control:hover {
		filter:
			brightness(1.8)
			contrast(1.25);

		transform: scale(1.12);
		transform-origin: bottom right;
	}

	.bg-picker {
		position: fixed;
		bottom: 38px;
		right: 10px;
		z-index: 1000;
		width: 240px;
		border-radius: 16px;
		background: var(--glass-soft);
		border: 1px solid var(--line-strong);
		box-shadow: var(--shadow-lg);
		backdrop-filter: blur(12px);
	}
	.bg-picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--line);
	}
	.bg-picker-header h3 {
		margin: 0;
		font-size: 14px;
	}
	.bg-picker-close {
		background: none;
		border: none;
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
		color: var(--muted);
	}
	.bg-picker-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		padding: 12px;
	}
	.bg-option {
		position: relative;
		width: 100%;
		height: 48px;
		border-radius: 10px;
		border: 2px solid transparent;
		cursor: pointer;
	}
	.bg-option.selected {
		border-color: var(--blue);
	}
	.bg-option:hover {
		border-color: var(--line-strong);
	}
	.bg-option-label {
		position: absolute;
		bottom: 4px;
		left: 6px;
		font-size: 10px;
		font-weight: 600;
		color: white;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
	}
</style>

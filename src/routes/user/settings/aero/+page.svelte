<script lang="ts">
	import { theme, setTheme } from '$lib/store/theme.svelte';
	import {
		backgroundId,
		setBackground,
		deviceImages,
		defaultBackground
	} from '$lib/store/background.svelte';
	import Icon from '$lib/components/Icon.svelte';
</script>

<div class="aero-page">
	<div class="admin-card">
		<div class="admin-card-head">
			<Icon name="palette" variant="duotone" size={16} />
			Aparência
		</div>
		<div class="admin-card-body">
			<h2 class="aero-label">Tema</h2>
			<div class="theme-cards">
				<button
					class="theme-card { $theme === 'light' ? 'selected' : '' }"
					on:click={() => setTheme('light')}
					aria-pressed={$theme === 'light'}
					aria-label="Usar tema claro"
				>
					<Icon name="sun" variant="duotone" size={20} />
					<span>Claro</span>
				</button>
				<button
					class="theme-card { $theme === 'dark' ? 'selected' : '' }"
					on:click={() => setTheme('dark')}
					aria-pressed={$theme === 'dark'}
					aria-label="Usar tema escuro"
				>
					<Icon name="moon" variant="duotone" size={20} />
					<span>Escuro</span>
				</button>
			</div>

			<h2 class="aero-label">Fundo</h2>
			<div class="bg-grid">
				{#each deviceImages as img (img.id)}
					<button
						class="bg-card { $backgroundId === img.id ? 'selected' : '' }"
						on:click={() => setBackground(img.id)}
						style="background: {img.background || defaultBackground}"
						aria-label={img.label}
					>
						<span>{img.label}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.aero-page {
		padding: 4px 0 8px;
	}

	.aero-label {
		margin: 0 0 10px;
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.theme-cards {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 10px;
		margin-bottom: 20px;
	}

	.bg-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 10px;
	}

	.theme-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		border: 2px solid rgba(90, 140, 175, 0.25);
		background: rgba(255, 255, 255, 0.38);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
		font-size: 14px;
		font-weight: 700;
		color: var(--text-strong);
		cursor: pointer;
	}

	.theme-card:hover {
		border-color: rgba(90, 186, 235, 0.55);
	}

	.theme-card.selected {
		border-color: var(--blue);
		box-shadow:
			inset 0 0 0 1px rgba(10, 132, 255, 0.1),
			0 4px 12px rgba(10, 132, 255, 0.18);
	}

	.bg-card {
		position: relative;
		height: 64px;
		border-radius: var(--radius-sm);
		border: 2px solid transparent;
		cursor: pointer;
	}

	.bg-card:hover {
		border-color: rgba(90, 186, 235, 0.55);
	}

	.bg-card.selected {
		border-color: var(--blue);
		box-shadow: 0 4px 12px rgba(10, 132, 255, 0.22);
	}

	.bg-card span {
		position: absolute;
		bottom: 6px;
		left: 8px;
		font-size: 11px;
		font-weight: 700;
		color: #fff;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
	}

	:global([data-theme='dark']) .theme-card {
		background: rgba(119, 194, 235, 0.08);
		border-color: rgba(182, 224, 250, 0.16);
		box-shadow: none;
		color: var(--text);
	}

	:global([data-theme='dark']) .theme-card:hover {
		background: rgba(119, 194, 235, 0.14);
		border-color: rgba(182, 224, 250, 0.3);
	}

	:global([data-theme='dark']) .bg-card:hover {
		border-color: rgba(182, 224, 250, 0.4);
	}

	:global([data-theme='dark']) .aero-label {
		color: var(--muted-soft);
	}
</style>

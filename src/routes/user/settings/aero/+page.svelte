<script lang="ts">
	import { theme, setTheme } from '$lib/store/theme.svelte';
	import {
		backgroundId,
		setBackground,
		deviceImages,
		defaultBackground,
		CUSTOM_BG_ID,
		userImageUrl,
		setUserBackground
	} from '$lib/store/background.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let customInput: HTMLInputElement | null = null;
	let customError = '';

	function pickUserImage(): void {
		customError = '';
		customInput?.click();
	}

	async function onCustomSelect(e: Event): Promise<void> {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) {
			return;
		}
		const err = await setUserBackground(file);
		// Reset after the read starts so the same file can be re-picked.
		input.value = '';
		if (err) {
			customError = err;
			return;
		}
	}
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
				<button
					class="bg-card bg-custom { $backgroundId === CUSTOM_BG_ID ? 'selected' : '' }"
					on:click={pickUserImage}
					title="Enviar imagem de fundo (PNG/JPEG, até 2MB)"
					aria-label="Enviar imagem de fundo"
				>
					{#if $userImageUrl}
						<img class="bg-card-img" src={$userImageUrl} alt="" />
					{:else}
						<span class="bg-custom-icon">
							<Icon name="gear" variant="light" size={20} />
						</span>
					{/if}
					<span>Imagem</span>
				</button>
			</div>
			<p class="bg-hint">PNG, JPEG ou JPG · até 2MB · 720p recomendado</p>
			{#if customError}<span class="bg-error">{customError}</span>{/if}
			<input
				type="file"
				accept="image/png,image/jpeg"
				bind:this={customInput}
				on:change={onCustomSelect}
				aria-label="Escolher imagem de fundo"
				hidden
			/>
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
		overflow: hidden;
	}

	.bg-custom {
		background: #3d4759;
	}
	.bg-card-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.bg-custom-icon {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
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

	.bg-hint {
		margin: 8px 2px 0;
		font-size: 11px;
		color: var(--muted-soft);
	}
	.bg-error {
		display: block;
		margin-top: 4px;
		font-size: 12px;
		color: #e74c5f;
	}
</style>

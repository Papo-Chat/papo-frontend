<script lang="ts">
	// Emojis: list + create + remove. Demo only — no API wiring.
	import { sampleEmojis } from '$lib/sample';
	import type { Emoji } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let emojis = $state<Emoji[]>([...sampleEmojis]);
	let creating = $state(false);
	let name = $state('');
	let emoji = $state('🔵');
	let filter = $state('');

	const visibleEmojis = $derived(
		filter ? emojis.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase())) : emojis
	);

	function add(): void {
		const n = name.trim();
		if (!n) return;
		emojis.push({
			id: `emoji-${n.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
			name: n,
			image_blob: '',
			format: 'png',
			created_by: 'luna',
			created_at: new Date().toISOString()
		});
		name = '';
		creating = false;
	}

	function remove(id: string): void {
		emojis = emojis.filter((e) => e.id !== id);
	}
</script>

<div class="emojis-page">
	<header class="emojis-head">
		<h2>Emojis</h2>
		<div class="emojis-actions">
			<input
				class="admin-input filter-input"
				placeholder="Filtrar emojis…"
				bind:value={filter}
				aria-label="Filtrar emojis"
			/>
			<button class="admin-btn" onclick={() => (creating = !creating)}>
				<Icon name="plus" variant="light" />
				Novo emoji
			</button>
		</div>
	</header>

	{#if creating}
		<div class="new-emoji">
			<input
				class="admin-input"
				placeholder="nome do emoji"
				bind:value={name}
				aria-label="Nome do emoji"
			/>
			<input
				class="admin-input emoji-emoji"
				type="text"
				maxlength="4"
				bind:value={emoji}
				aria-label="Emojis Unicode"
				placeholder="🙂"
			/>
			<button class="admin-btn" onclick={add}>Criar</button>
			<button class="admin-btn ghost" onclick={() => (creating = false)}> Cancelar </button>
		</div>
	{/if}

	{#if visibleEmojis.length === 0}
		<div class="admin-card">
			<div class="admin-card-head">
				<Icon name="smiley" variant="duotone" size={16} />
				Emojis
			</div>
			<div class="admin-card-body">
				<div class="empty">Nenhum emoji criado</div>
			</div>
		</div>
	{:else}
		<div class="emoji-grid">
			{#each visibleEmojis as e (e.id)}
				<div class="emoji-cell">
					<div class="emoji-swatch" aria-hidden="true">
						{e.name[0]?.toUpperCase()}
					</div>
					<div class="emoji-info">
						<span class="emoji-name">{e.name}</span>
						<span class="emoji-meta">por {e.created_by}</span>
					</div>
					<button
						class="emoji-remove"
						aria-label={`Remover emoji ${e.name}`}
						onclick={() => remove(e.id)}
					>
						<Icon name="trash" variant="light" size={14} />
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.emojis-page {
		padding: 4px 0 8px;
	}
	.emojis-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 12px;
	}
	.emojis-head h2 {
		margin: 0;
		font-size: 20px;
	}
	.emojis-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.emojis-actions .filter-input {
		width: 150px;
	}
	.new-emoji {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}
	.new-emoji .admin-input {
		flex: 1;
		min-width: 160px;
	}
	.emoji-emoji {
		flex: none;
		width: 70px;
		font-size: 18px;
		text-align: center;
	}
	.emoji-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.emoji-meta {
		font-size: 10px;
		color: var(--muted-soft);
	}
	.emoji-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 12px;
	}
	.emoji-cell {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.32);
		border: 1px solid rgba(255, 255, 255, 0.42);
		backdrop-filter: blur(14px);
	}
	:global([data-theme='dark']) .emoji-cell {
		background: linear-gradient(145deg, rgba(25, 51, 68, 0.72), rgba(12, 33, 48, 0.62));
		border-color: rgba(182, 224, 250, 0.14);
	}
	.emoji-swatch {
		flex: none;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		font-size: 18px;
		font-weight: 800;
		color: #fff;
		background: linear-gradient(135deg, #7a28ce, #3a86ff);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
	}
	.emoji-name {
		font-size: 13px;
		font-weight: 700;
		color: var(--text);
	}
	.emoji-remove {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--text);
		cursor: pointer;
		opacity: 0.5;
		transition: 0.14s var(--ease);
	}
	.emoji-remove:hover {
		opacity: 1;
		background: rgba(240, 61, 94, 0.14);
		color: #f03d5e;
	}
	.empty {
		font-size: 13px;
		color: var(--muted-soft);
	}
</style>

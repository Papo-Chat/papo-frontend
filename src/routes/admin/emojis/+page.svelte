<script lang="ts">
	// Emojis: list + create + remove. Demo only — no API wiring.
	import { sampleEmojis } from '$lib/sample';
	import type { Emoji } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let emojis = $state<Emoji[]>([...sampleEmojis]);
	let creating = $state(false);
	let name = $state('');
	let emoji = $state('🔵');

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
		<button class="admin-btn" onclick={() => (creating = !creating)}>
			<Icon name="plus" variant="light" />
			Novo emoji
		</button>
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
			<button class="admin-btn ghost" onclick={() => (creating = false)}>
				Cancelar
			</button>
		</div>
	{/if}

	{#if emojis.length === 0}
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
			{#each emojis as e (e.id)}
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
	.emojis-page{
		padding: 4px 0 8px;
	}
	.emojis-head{
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}
	.emojis-head h2{
		margin: 0;
		font-size: 20px;
	}
	.new-emoji{
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}
	.new-emoji .admin-input{
		flex: 1;
		min-width: 160px;
	}
	.emoji-emoji{
		flex: none;
		width: 70px;
		font-size: 18px;
		text-align: center;
	}
	.emoji-info{
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.emoji-meta{
		font-size: 10px;
		color: var(--muted-soft);
	}
	.emoji-cell{
		position: relative;
	}
	.emoji-remove{
		position: absolute;
		top: 6px;
		right: 6px;
	}
	.empty{
		font-size: 13px;
		color: var(--muted-soft);
	}
</style>

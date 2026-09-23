<script lang="ts">
	// Server creation / edit. Demo only — no API wiring.
	import { sampleServer } from '$lib/sample';
	import Icon from '$lib/components/Icon.svelte';

	let name = $state(sampleServer.name);
	let public_ = $state(sampleServer.public);
	let saved = $state(false);

	function save(): void {
		// Demo: no API.
		saved = true;
	}
</script>

<div class="server-page">
	<div class="server-card">
		<div class="server-card-head">
			<div class="server-icon" aria-hidden="true">
				<Icon name="server" variant="duotone" size={26} />
			</div>
			<h2>{name || 'Novo servidor'}</h2>
		</div>

		<div class="server-stats">
			<div class="stat">
				<span>Membros</span>
				<strong>{sampleServer.member_count}</strong>
			</div>
			<div class="stat">
				<span>Canais</span>
				<strong>{sampleServer.channel_count}</strong>
			</div>
			<div class="stat">
				<span>Papéis</span>
				<strong>{sampleServer.role_count}</strong>
			</div>
		</div>

		<div class="admin-card">
			<div class="admin-card-head">
				<Icon name="settings" variant="duotone" size={16} />
				Definições
			</div>
			<div class="admin-card-body">
				<div class="admin-field">
					<label for="sv-name">Nome</label>
					<input
						id="sv-name"
						class="admin-input"
						bind:value={name}
						placeholder="Nome do servidor"
					/>
				</div>
				<div class="admin-field">
					<label for="sv-owner">Dono</label>
					<input
						id="sv-owner"
						class="admin-input"
						value={sampleServer.owner_username ?? ''}
						disabled
					/>
				</div>
				<label class="admin-checkbox">
					<input type="checkbox" bind:checked={public_} />
					<div>
						<strong>Público</strong>
						<span class="hint">Qualquer pessoa pode entrar com o link</span>
					</div>
				</label>
				<div class="admin-stat">
					<span>Criado</span>
					<strong>{sampleServer.created_at}</strong>
				</div>
			</div>
		</div>

		<div class="server-actions">
			<button class="admin-btn" onclick={save}>
				<Icon name="check" variant="light" />
				Salvar alterações
			</button>
			{#if saved}
				<span class="saved">Alterações salvas</span>
			{/if}
		</div>
	</div>
</div>

<style>
	.server-page{
		padding: 4px 0 8px;
	}
	.server-card{
		max-width: 560px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.server-card-head{
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.server-icon{
		width: 44px;
		height: 44px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		background: linear-gradient(145deg, #51a8f0, #0b71d3);
		box-shadow: 0 8px 18px rgba(11,113,211,.25);
	}
	.server-card-head h2{
		margin: 0;
		font-size: 20px;
	}
	.server-stats{
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.stat{
		padding: 10px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.32);
		border: 1px solid rgba(255, 255, 255, 0.5);
	}
	[data-theme="dark"] .stat{
		background: rgba(25,51,68,.6);
		border-color: rgba(185,224,250,.14);
	}
	.stat span{
		display: block;
		font-size: 10px;
		color: var(--muted-soft);
		margin-bottom: 2px;
	}
	.stat strong{
		font-size: 17px;
	}
	.server-actions{
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.saved{
		font-size: 12px;
		font-weight: 700;
		color: #24c982;
	}
</style>

<script lang="ts">
	// Server creation / edit. Demo only — no API wiring.
	import { sampleServer } from '$lib/sample';
	import { blobToUrl } from '$lib/utils/media';
	import Icon from '$lib/components/Icon.svelte';
	import ServerIcon from '$lib/components/ServerIcon.svelte';

	let name = $state(sampleServer.name);
	let public_ = $state(sampleServer.public);
	let password = $state('');
	let iconBlob = $state('');
	let iconFormat = $state('');
	let saved = $state(false);

	function onIconSelect(e: Event): void {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result;
			if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
				const idx = dataUrl.indexOf(',');
				iconBlob = idx >= 0 ? dataUrl.slice(idx + 1) : '';
				iconFormat = file.type.split('/')[1]?.toUpperCase() ?? 'PNG';
			}
		};
		reader.readAsDataURL(file);
	}

	function resetIcon(): void {
		iconBlob = '';
		iconFormat = '';
	}

	function save(): void {
		// Demo: no API.
		saved = true;
	}
</script>

<div class="server-page">
	<div class="server-card">
		<div class="server-card-head">
			<div class="server-icon" aria-hidden="true">
				<ServerIcon
					iconBlob={iconBlob}
					iconFormat={iconFormat}
					name={name}
					size={44}
					dark
				/>
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
				<span>Roles</span>
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
				<div class="admin-field">
					<label for="sv-password">Senha</label>
					<input
						id="sv-password"
						class="admin-input"
						type="password"
						bind:value={password}
						placeholder="Senha do servidor"
					/>
					<span class="hint">Mín. 8 caracteres, 1 maiúscula + 1 especial</span>
				</div>
				<div class="admin-field">
					<label for="sv-icon">Ícone</label>
					<div class="icon-field-row">
						<input
							id="sv-icon"
							class="admin-input icon-file"
							type="file"
							accept="image/*"
							onchange={onIconSelect}
						/>
						<button class="icon-reset" onclick={resetIcon} aria-label="Remover ícone">
							<Icon name="x" variant="light" size={14} />
						</button>
					</div>
					{#if iconBlob}
						<div class="icon-preview">
							<img src={blobToUrl(iconBlob, iconFormat)} alt="Pré-visualização do ícone" />
						</div>
					{:else}
						<div class="icon-preview empty">
							<Icon name="image" variant="duotone" size={20} />
							Sem ícone
						</div>
					{/if}
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
		overflow: hidden;
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
	:global([data-theme="dark"]) .stat{
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

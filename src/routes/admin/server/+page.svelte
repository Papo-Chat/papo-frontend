<script lang="ts">
	import { state as sessionState } from '$lib/store/session.svelte';
	import * as serverStore from '$lib/store/server.svelte';
	import { blobToUrl } from '$lib/utils/media';
	import { isValidPassword } from '$lib/utils/password';
	import Icon from '$lib/components/Icon.svelte';
	import ServerIcon from '$lib/components/ServerIcon.svelte';

	// O servidor é um singleton (máx. 1 por usuário). A página atende os dois
	// estados: criação (sem servidor, rota de fallback do bootstrap) e edição.
	const server = $derived(serverStore.state.server);
	const loading = $derived(serverStore.state.loading);

	let name = $state('');
	let public_ = $state(true);
	let password = $state('');
	let iconBlob = $state('');
	let iconFormat = $state('');
	let creating = $state(true);
	let saving = $state(false);
	let saved = $state(false);
	let savedMessage = $state('');
	let error = $state<string | null>(null);
	let seeded = $state(false);

	// Garante que o servidor (ou a ausência dele) foi carregado para esta rota
	// (navegação direta a /admin/server sem passar pelo chat).
	$effect(() => {
		if (serverStore.state.loaded) return;
		void serverStore.load();
	});

	// Semeia o estado local da forma uma vez que o servidor é conhecido
	// (existente → edição; ausente → criação).
	$effect(() => {
		if (!serverStore.state.loaded || seeded) return;
		if (server) {
			name = server.name;
			public_ = server.public;
			password = '';
			iconBlob = server.icon_blob ?? '';
			iconFormat = server.icon_format;
			creating = false;
		} else {
			// Servidor ainda não criado.
			name = '';
			public_ = true;
			password = '';
			iconBlob = '';
			iconFormat = '';
			creating = true;
		}
		seeded = true;
	});

	const isPrivate = $derived(!public_);
	const passwordErrors = $derived(
		isPrivate && password ? isValidPassword(password).errors : []
	);
	const canSave = $derived(
		name.trim().length > 0 &&
		name.length <= 32 &&
		(!isPrivate || (password && isValidPassword(password).ok))
	);

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

	async function save(): Promise<void> {
		if (saving || !canSave) return;
		error = null;
		saved = false;
		saving = true;
		const req = {
			name: name.trim(),
			icon_blob: iconBlob,
			icon_format: iconFormat,
			public: public_,
			password: isPrivate ? password : null
		};
		try {
			const wasCreating = creating;
			const next = wasCreating
				? await serverStore.create(req)
				: await serverStore.update(req);

			name = next.name;
			public_ = next.public;
			iconBlob = next.icon_blob ?? '';
			iconFormat = next.icon_format;
			password = '';
			creating = false;
			savedMessage = wasCreating ? 'Servidor criado.' : 'Alterações salvas.';
			saved = true;
			setTimeout(() => (saved = false), 2000);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao salvar o servidor.';
		} finally {
			saving = false;
		}
	}
</script>

{#if loading && !seeded}
	<div class="server-page">
		<div class="server-card">
			<div class="chat-empty">
				<p>Carregando o servidor…</p>
			</div>
		</div>
	</div>
{:else}
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
				<h2>{name || (creating ? 'Novo servidor' : 'Servidor')}</h2>
			</div>

			{#if server}
				<div class="server-stats">
					<div class="stat">
						<span>Membros</span>
						<strong>{server.member_count}</strong>
					</div>
					<div class="stat">
						<span>Canais</span>
						<strong>{server.channel_count}</strong>
					</div>
					<div class="stat">
						<span>Roles</span>
						<strong>{server.role_count}</strong>
					</div>
				</div>
			{/if}

			<div class="admin-card">
				<div class="admin-card-head">
					<Icon name="gear" variant="duotone" size={16} />
					{creating ? 'Criar servidor' : 'Definições'}
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

					{#if server}
						<div class="admin-field">
							<label for="sv-owner">Dono</label>
							<input
								id="sv-owner"
								class="admin-input"
								value={server.owner_username ?? ''}
								disabled
							/>
						</div>
					{/if}

					<div class="admin-field">
						<label for="sv-password">Senha</label>
						{#if isPrivate}
							<input
								id="sv-password"
								class="admin-input"
								type="password"
								bind:value={password}
								placeholder="Senha do servidor"
							/>
							<span class="hint">
								Mín. 8 caracteres, 1 maiúscula + 1 especial
							</span>
							{#if passwordErrors.length}
								{#each passwordErrors as err (err)}
									<span class="hint error">{err}</span>
								{/each}
							{/if}
						{:else}
							<span class="hint">Servidor público — sem senha.</span>
						{/if}
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
								aria-describedby="sv-icon-limit"
							/>
							<button class="icon-reset" onclick={resetIcon} aria-label="Remover ícone">
								<Icon name="x" variant="light" size={14} />
							</button>
						</div>
						<span id="sv-icon-limit" class="hint">Máximo: 512 × 512 px.</span>
						{#if iconBlob}
							<div class="icon-preview">
								<img
									src={blobToUrl(iconBlob, iconFormat)}
									alt="Pré-visualização do ícone"
								/>
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

					{#if server}
						<div class="admin-stat">
							<span>Criado</span>
							<strong>{server.created_at}</strong>
						</div>
					{/if}
				</div>
			</div>

			{#if error}
				<div class="save-error" role="alert">
					<Icon name="warning-circle" variant="light" />
					<span>{error}</span>
				</div>
			{:else if saved}
				<span class="saved">{savedMessage}</span>
			{/if}

			<div class="server-actions">
				<button class="admin-btn" onclick={save} disabled={saving || !canSave}>
					<Icon name="check" variant="light" />
					{saving ? 'Salvando…' : creating ? 'Criar servidor' : 'Salvar alterações'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.server-page {
		padding: 4px 0 8px;
	}
	.server-card {
		max-width: 560px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.server-card-head {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.server-icon {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		overflow: hidden;
		background: linear-gradient(145deg, #51a8f0, #0b71d3);
		box-shadow: 0 8px 18px rgba(11, 113, 211, 0.25);
	}
	.server-card-head h2 {
		margin: 0;
		font-size: 20px;
	}

	.server-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.stat {
		padding: 10px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.32);
		border: 1px solid rgba(255, 255, 255, 0.5);
	}
	:global([data-theme='dark']) .stat {
		background: rgba(25, 51, 68, 0.6);
		border-color: rgba(185, 224, 250, 0.14);
	}
	.stat span {
		display: block;
		font-size: 10px;
		color: var(--muted-soft);
		margin-bottom: 2px;
	}
	.stat strong {
		font-size: 17px;
	}
	.admin-field,
	.icon-field-row,
	.hint,
	.save-error {
		font-size: 13px;
	}
	.hint {
		font-size: 11px;
		color: var(--muted-soft);
	}
	.hint.error {
		color: #e74c5f;
	}
	.save-error {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border: 1px solid rgba(220, 40, 40, 0.5);
		border-radius: 14px;
		background: rgba(220, 40, 40, 0.1);
		color: #b91c1c;
		font-size: 13px;
	}
	.server-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.saved {
		font-size: 12px;
		font-weight: 700;
		color: #24c982;
	}
	.chat-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 240px;
		color: var(--muted-soft);
		font-size: 14px;
	}
</style>

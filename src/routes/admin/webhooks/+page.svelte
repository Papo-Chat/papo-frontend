<script lang="ts">
	// Admin de webhooks: criação (com o token exibido uma única vez), identidade
	// persistente (nickname + avatar) e revogação. Exige manage_webhooks (o
	// layout do admin já bloqueia a rota).
	import { onMount } from 'svelte';
	import * as webhooksStore from '$lib/store/webhooks.svelte';
	import * as channelsStore from '$lib/store/channels.svelte';
	import { isMobileUi } from '$lib/store/performance.svelte';
	import { fileToBase64 } from '$lib/utils/upload';
	import { mimeToFormat, webhookAvatarUrl } from '$lib/utils/media';
	import { formatTime } from '$lib/utils/time';
	import type { Channel, Webhook } from '$lib/types';
	import WebhookAvatar from '$lib/components/WebhookAvatar.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let creating = $state(false);
	let newChannelId = $state('');
	let newName = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);
	let success = $state('');
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
	let loadError = $state<string | null>(null);

	// Token do último webhook criado: existe somente nesta sessão de gestão
	// (o backend guarda apenas o hash; não há como recuperá-lo depois).
	let issuedToken = $state<{ webhookId: string; name: string; token: string } | null>(null);
	let tokenCopied = $state(false);

	// Webhook com o editor de identidade aberto.
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let selectedAvatarFile: File | null = $state(null);
	let removeAvatar = $state(false);
	// Busting de cache do preview do avatar (o endpoint serve com max-age).
	let avatarBust = $state(0);
	// Revogação exige confirmação em dois passos (sem window.confirm, padrão
	// do projeto): o primeiro clique arma o botão, o segundo executa.
	let confirmRevokeId = $state<string | null>(null);

	const webhooks = $derived(webhooksStore.state.list);
	const hookChannels = $derived(
		channelsStore.state.ordered
			.map((id) => channelsStore.state.byId.get(id))
			.filter((c): c is Channel => !!c && (c.type === 'text' || c.type === 'voice'))
	);
	const channelName = (id: string): string => channelsStore.state.byId.get(id)?.name ?? '—';

	onMount(() => {
		void webhooksStore.load().catch((err) => {
			loadError = err instanceof Error ? err.message : 'Falha ao carregar webhooks.';
		});
	});

	function feedback(message: string): void {
		success = message;
		error = null;
		if (feedbackTimer) clearTimeout(feedbackTimer);
		feedbackTimer = setTimeout(() => (success = ''), 2200);
	}

	function avatarPreviewUrl(webhookId: string): string {
		const base = webhookAvatarUrl(webhookId);
		return avatarBust ? `${base}?v=${avatarBust}` : base;
	}

	async function create(): Promise<void> {
		const n = newName.trim();
		if (!n || !newChannelId || saving) return;
		saving = true;
		error = null;
		try {
			const { webhook, token } = await webhooksStore.create(newChannelId, n);
			issuedToken = { webhookId: webhook.id, name: webhook.name, token };
			tokenCopied = false;
			newName = '';
			creating = false;
			feedback('Webhook criado.');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao criar webhook.';
		} finally {
			saving = false;
		}
	}

	function openIdentity(w: Webhook): void {
		editingId = editingId === w.id ? null : w.id;
		editName = w.display_name ?? '';
		selectedAvatarFile = null;
		removeAvatar = false;
		confirmRevokeId = null;
		error = null;
	}

	function onAvatarSelect(e: Event): void {
		selectedAvatarFile = (e.target as HTMLInputElement).files?.[0] ?? null;
		removeAvatar = false;
		error = null;
	}

	async function saveIdentity(id: string): Promise<void> {
		if (saving) return;
		saving = true;
		error = null;
		try {
			const req: { display_name?: string; avatar?: string; avatar_format?: string } = {
				display_name: editName.trim()
			};
			if (removeAvatar) {
				req.avatar = '';
			} else if (selectedAvatarFile) {
				const image = await fileToBase64(selectedAvatarFile, 'avatar');
				req.avatar = image.base64;
				req.avatar_format = mimeToFormat(image.mime);
			}
			await webhooksStore.updateIdentity(id, req);
			avatarBust += 1;
			editingId = null;
			feedback('Identidade atualizada.');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao atualizar identidade.';
		} finally {
			saving = false;
		}
	}

	async function revoke(w: Webhook): Promise<void> {
		if (saving) return;
		if (confirmRevokeId !== w.id) {
			confirmRevokeId = w.id;
			return;
		}
		confirmRevokeId = null;
		saving = true;
		error = null;
		try {
			await webhooksStore.revoke(w.id);
			if (editingId === w.id) editingId = null;
			if (issuedToken?.webhookId === w.id) issuedToken = null;
			feedback('Webhook revogado.');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao revogar webhook.';
		} finally {
			saving = false;
		}
	}

	async function copyToken(): Promise<void> {
		if (!issuedToken) return;
		try {
			await navigator.clipboard.writeText(issuedToken.token);
			tokenCopied = true;
			setTimeout(() => (tokenCopied = false), 1800);
		} catch {
			error = 'Não foi possível copiar automaticamente; copie o token manualmente.';
		}
	}
</script>

<div class="webhooks-page">
	<header class="webhooks-head">
		<h2>Webhooks</h2>
		<div class="webhooks-actions">
			<button class="admin-btn" onclick={() => (creating = !creating)}>
				<Icon name="plus" variant="light" />
				Novo webhook
			</button>
		</div>
	</header>

	{#if error}
		<div class="webhook-error" role="alert">{error}</div>
	{:else if success}
		<div class="webhook-success" aria-live="polite">{success}</div>
	{/if}

	{#if issuedToken}
		<div class="admin-card issued-token" role="status">
			<div class="admin-card-head">
				<Icon name="key" variant="duotone" size={16} />
				Token de acesso de "{issuedToken.name}"
			</div>
			<div class="admin-card-body">
				<p class="token-warning">
					Este token aparece <em>uma única vez</em>. Guarde-o agora; não é possível recuperá-lo
					depois.
				</p>
				<div class="token-row">
					<input class="admin-input token-value" readonly value={issuedToken.token} aria-label="Token do webhook" />
					<button class="admin-btn" onclick={copyToken}>
						<Icon name={tokenCopied ? 'check' : 'copy'} variant="light" />
						{tokenCopied ? 'Copiado' : 'Copiar'}
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if creating}
		<div class="new-webhook">
			<select class="admin-input" bind:value={newChannelId} aria-label="Canal do webhook">
				<option value="">Canal…</option>
				{#each hookChannels as c (c.id)}
					<option value={c.id}>{c.type === 'voice' ? '🎙 ' : '# '}{c.name}</option>
				{/each}
			</select>
			<input
				class="admin-input"
				placeholder="nome do webhook"
				bind:value={newName}
				aria-label="Nome do webhook"
				maxlength="80"
				autofocus={!isMobileUi()}
			/>
			<button
				class="admin-btn"
				onclick={create}
				disabled={saving || !newName.trim() || !newChannelId}
			>
				{saving ? 'Criando…' : 'Criar'}
			</button>
			<button class="admin-btn ghost" onclick={() => (creating = false)} disabled={saving}>
				Cancelar
			</button>
		</div>
	{/if}

	{#if loadError}
		<div class="webhook-error" role="alert">{loadError}</div>
	{:else}
		<div class="admin-card webhooks-card">
			<div class="admin-card-head">
				<Icon name="webhooks-logo" variant="duotone" size={16} />
				Webhooks ({webhooks.length})
			</div>
			<div class="admin-card-body">
				{#if webhooksStore.state.loading && webhooks.length === 0}
					<div class="empty">Carregando webhooks…</div>
				{:else if webhooks.length === 0}
					<div class="empty">Nenhum webhook ativo. Crie um webhook para integrações enviarem mensagens a um canal.</div>
				{:else}
					<ul class="webhooks-list">
						{#each webhooks as w (w.id)}
							<li class="webhook-item">
								<div class="webhook-main">
									<span class="webhook-avatar-wrap">
										<WebhookAvatar
											avatarUrl={editingId === w.id ? avatarPreviewUrl(w.id) : webhookAvatarUrl(w.id)}
											size={36}
										/>
									</span>
									<div class="webhook-info">
										<div class="webhook-title">
											<strong>{w.name}</strong>
											{#if w.display_name}
												<span class="webhook-display-name">exibe como “{w.display_name}”</span>
											{/if}
										</div>
										<div class="webhook-meta">
											<span>canal: {channelName(w.channel_id)}</span>
											<span>criado em {formatTime(w.created_at)}</span>
										</div>
									</div>
								</div>
								<div class="webhook-controls">
									<button class="admin-btn ghost small" onclick={() => openIdentity(w)} disabled={saving}>
										<Icon name="identification-card" variant="light" size={14} />
										Identidade
									</button>
									<button
										class="admin-btn ghost small danger"
										class:armed={confirmRevokeId === w.id}
										onclick={() => revoke(w)}
										disabled={saving}
									>
										<Icon name="trash" variant="light" size={14} />
										{confirmRevokeId === w.id ? 'Confirmar revogação' : 'Revogar'}
									</button>
								</div>

								{#if editingId === w.id}
									<div class="identity-editor">
										<label class="identity-field">
											<span>Nickname de exibição</span>
											<input
												class="admin-input"
												placeholder={w.name}
												bind:value={editName}
												maxlength="100"
												aria-label="Nickname de exibição do webhook"
											/>
											<small>Vazio usa o nome do webhook.</small>
										</label>
										<label class="identity-field">
											<span>Avatar</span>
											<input
												type="file"
												accept="image/gif,image/jpeg,image/png,image/webp"
												onchange={onAvatarSelect}
												aria-label="Imagem do avatar do webhook"
												aria-describedby="webhook-avatar-limit"
											/>
											<small id="webhook-avatar-limit">Máximo: 512 × 512 px, 2MB.</small>
											{#if removeAvatar}
												<small class="identity-remove">Avatar será removido ao salvar.</small>
											{:else}
												<button
													type="button"
													class="admin-btn ghost small"
													onclick={() => (removeAvatar = true)}
												>
													Remover avatar atual
												</button>
											{/if}
										</label>
										<div class="identity-actions">
											<button class="admin-btn" onclick={() => saveIdentity(w.id)} disabled={saving}>
												{saving ? 'Salvando…' : 'Salvar identidade'}
											</button>
											<button
												class="admin-btn ghost"
												onclick={() => (editingId = null)}
												disabled={saving}
											>
												Cancelar
											</button>
										</div>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.webhooks-page {
		padding: 4px 0 8px;
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.webhooks-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	.webhooks-head h2 {
		margin: 0;
		font-size: 20px;
	}

	.webhooks-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.new-webhook {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
		margin-bottom: 12px;
	}

	.new-webhook .admin-input {
		min-width: 180px;
	}

	.issued-token {
		margin-bottom: 12px;
	}

	.token-warning {
		margin: 0 0 10px;
		font-size: 13px;
		color: var(--muted);
		line-height: 1.45;
	}

	.token-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.token-value {
		min-width: 0;
		flex: 1;
		font-family: ui-monospace, monospace;
		font-size: 11px;
	}

	.webhooks-card {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.webhooks-card .admin-card-body {
		flex: 1;
		min-height: 0;
	}

	.empty {
		padding: 18px;
		color: var(--muted-soft);
		font-size: 13px;
		text-align: center;
	}

	.webhooks-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}

	.webhook-item {
		display: grid;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.32);
		border: 1px solid rgba(255, 255, 255, 0.42);
	}

	.webhook-main {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.webhook-info {
		min-width: 0;
	}

	.webhook-title {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: baseline;
	}

	.webhook-title strong {
		font-size: 14px;
	}

	.webhook-display-name {
		font-size: 12px;
		color: var(--muted);
	}

	.webhook-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		font-size: 12px;
		color: var(--muted);
		margin-top: 3px;
	}

	.webhook-controls {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.identity-editor {
		display: grid;
		gap: 12px;
		padding: 12px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.22);
		border: 1px dashed rgba(86, 143, 177, 0.28);
	}

	.identity-field {
		display: grid;
		gap: 4px;
		font-size: 13px;
	}

	.identity-field span {
		font-size: 12px;
		font-weight: 700;
		color: var(--link-muted);
	}

	.identity-field small {
		color: var(--muted-soft);
		font-size: 11px;
	}

	.identity-remove {
		color: #c43a46;
	}

	.identity-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.admin-btn.ghost.small {
		height: 32px;
		padding: 0 10px;
		font-size: 12px;
	}

	.admin-btn.ghost.danger {
		color: #c43a46;
	}

	.admin-btn.ghost.danger:hover {
		background: rgba(240, 61, 94, 0.14);
		color: #f03d5e;
	}

	.admin-btn.ghost.danger.armed {
		background: rgba(240, 61, 94, 0.16);
		border-color: rgba(240, 61, 94, 0.4);
		color: #f03d5e;
	}

	.webhook-error,
	.webhook-success {
		margin-bottom: 10px;
		padding: 8px 12px;
		border-radius: 10px;
		font-size: 12px;
	}

	.webhook-error {
		background: rgba(220, 40, 40, 0.1);
		color: #c43a46;
	}

	.webhook-success {
		background: rgba(36, 201, 130, 0.1);
		color: #199966;
	}

	:global([data-theme='dark']) .webhook-item {
		background: rgba(119, 194, 235, 0.06);
		border-color: rgba(182, 224, 250, 0.14);
	}

	:global([data-theme='dark']) .identity-editor {
		background: rgba(119, 194, 235, 0.05);
		border-color: rgba(182, 224, 250, 0.18);
	}

	@media (max-width: 560px) {
		.new-webhook {
			align-items: stretch;
		}
		.new-webhook .admin-input {
			min-width: 0;
			flex: 1 1 100%;
		}
		.token-row {
			align-items: stretch;
			flex-direction: column;
		}
		.token-row .admin-btn {
			width: 100%;
			justify-content: center;
		}
	}
</style>

<script lang="ts">
	import * as settingsStore from '$lib/store/settings.svelte';
	import * as channelsStore from '$lib/store/channels.svelte';
	import type { NotificationSettings, UserConfig } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let config: UserConfig | null = $state(null);
	let seededVersion = $state(-1);
	let saving = $state(false);
	let saved = $state(false);
	let error = $state<string | null>(null);
	let allNotificationSetting = $state<NotificationSettings>('only_mentions');
	let applyingAll = $state(false);
	let channelSaving = $state(new Set<string>());

	const channels = $derived(
		channelsStore.state.ordered
			.map((id) => channelsStore.state.byId.get(id))
			.filter((c) => !!c && c.type !== 'category')
	);

	$effect(() => {
		if (!channelsStore.state.loaded && !channelsStore.state.loading) void channelsStore.load();
	});

	$effect(() => {
		const current = settingsStore.state.config;
		const version = settingsStore.state.version;
		if (!current || version === seededVersion) return;

		config = {
			theme: current.theme,
			notifications: { ...current.notifications },
			display: { ...current.display }
		};
		seededVersion = version;
	});

	async function save(): Promise<void> {
		if (!config || saving) return;
		saving = true;
		saved = false;
		error = null;
		try {
			await settingsStore.update({
				theme: config.theme,
				notifications: { ...config.notifications },
				display: { ...config.display }
			});
			saved = true;
			setTimeout(() => (saved = false), 1800);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao salvar configurações.';
		} finally {
			saving = false;
		}
	}

	async function setChannelNotification(
		channelId: string,
		value: NotificationSettings
	): Promise<void> {
		if (channelSaving.has(channelId)) return;
		channelSaving = new Set([...channelSaving, channelId]);
		error = null;
		try {
			await channelsStore.setChannelNotification(channelId, value);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao atualizar notificações do canal.';
		} finally {
			const next = new Set(channelSaving);
			next.delete(channelId);
			channelSaving = next;
		}
	}

	async function applyAllNotifications(): Promise<void> {
		if (applyingAll) return;
		applyingAll = true;
		error = null;
		try {
			await channelsStore.setAllChannelNotifications(allNotificationSetting);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao atualizar todos os canais.';
		} finally {
			applyingAll = false;
		}
	}

	function notificationLabel(value: NotificationSettings): string {
		if (value === 'all') return 'Todas';
		if (value === 'only_mentions') return 'Somente menções';
		return 'Nada';
	}
</script>

<div class="settings-page">
	{#if error}
		<div class="settings-error" role="alert">
			<Icon name="warning-circle" variant="light" />
			{error}
		</div>
	{/if}

	{#if config}
		<div class="admin-card">
			<div class="admin-card-head">
				<Icon name="bell" variant="duotone" size={16} />
				Notificações gerais
			</div>
			<div class="admin-card-body">
				<label class="admin-checkbox">
					<input type="checkbox" bind:checked={config.notifications.enabled} />
					<span class="cb-text">
						<strong>Notificações</strong>
						<span class="hint">Ativar ou desativar notificações do aplicativo</span>
					</span>
				</label>
				<label class="admin-checkbox">
					<input type="checkbox" bind:checked={config.notifications.messagePreview} />
					<span class="cb-text">
						<strong>Prévia de mensagens</strong>
						<span class="hint">Mostrar o conteúdo na notificação</span>
					</span>
				</label>
				<label class="admin-checkbox">
					<input type="checkbox" bind:checked={config.notifications.sound} />
					<span class="cb-text">
						<strong>Som</strong>
						<span class="hint">Tocar som ao receber uma notificação</span>
					</span>
				</label>
			</div>
		</div>

		<div class="admin-card channel-notification-card">
			<div class="admin-card-head">
				<div class="card-title">
					<Icon name="chat-circle-dots" variant="duotone" size={16} />
					Notificações por canal
				</div>
				<div class="notification-bulk">
					<select class="admin-select" bind:value={allNotificationSetting} aria-label="Tipo para todos os canais">
						<option value="all">Todas</option>
						<option value="only_mentions">Somente menções</option>
						<option value="off">Nada</option>
					</select>
					<button class="admin-btn" onclick={applyAllNotifications} disabled={applyingAll}>
						{applyingAll ? 'Aplicando…' : 'Aplicar a todos'}
					</button>
				</div>
			</div>
			<div class="admin-card-body channel-notification-list">
				{#if channelsStore.state.loading && channels.length === 0}
					<div class="empty">Carregando canais…</div>
				{:else}
					{#each channels as channel (channel.id)}
						<div class="channel-notification-row">
							<div class="channel-copy">
								<strong>#{channel.name}</strong>
								<span>{notificationLabel(channel.notification_settings)}</span>
							</div>
							<select
								class="admin-select channel-notification-select"
								value={channel.notification_settings}
								disabled={channelSaving.has(channel.id)}
								onchange={(e) =>
									void setChannelNotification(
										channel.id,
										(e.currentTarget as HTMLSelectElement).value as NotificationSettings
									)}
								aria-label={`Notificações de ${channel.name}`}
							>
								<option value="all">Todas</option>
								<option value="only_mentions">Somente menções</option>
								<option value="off">Nada</option>
							</select>
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<div class="admin-card">
			<div class="admin-card-head">
				<Icon name="monitor" variant="duotone" size={16} />
				Aparência
			</div>
			<div class="admin-card-body">
				<div class="admin-field">
					<label for="set-font">Tamanho da fonte</label>
					<select id="set-font" class="admin-select" bind:value={config.display.fontSize}>
						<option value="small">Pequena</option>
						<option value="normal">Normal</option>
						<option value="large">Grande</option>
					</select>
				</div>
				<div class="admin-field">
					<label for="set-density">Densidade</label>
					<select id="set-density" class="admin-select" bind:value={config.display.messageDensity}>
						<option value="compact">Compacta</option>
						<option value="comfortable">Confortável</option>
						<option value="spacious">Espaçosa</option>
					</select>
				</div>
				<label class="admin-checkbox">
					<input type="checkbox" bind:checked={config.display.showTimestamps} />
					<span class="cb-text">
						<strong>Mostrar timestamps</strong>
						<span class="hint">Exibir data e hora nas mensagens</span>
					</span>
				</label>
				<label class="admin-checkbox">
					<input type="checkbox" bind:checked={config.display.showAvatars} />
					<span class="cb-text">
						<strong>Mostrar avatares</strong>
						<span class="hint">Exibir avatar ao lado de cada mensagem</span>
					</span>
				</label>
			</div>
		</div>

		<div class="settings-actions">
			<button class="admin-btn" onclick={save} disabled={saving}>
				<Icon name="check" variant="light" />
				{saving ? 'Salvando…' : 'Salvar alterações'}
			</button>
			{#if saved}
				<span class="saved">Alterações salvas</span>
			{/if}
		</div>
	{:else}
		<div class="empty">Carregando configurações…</div>
	{/if}
</div>

<style>
	.settings-page { padding:4px 0 8px; display:grid; gap:14px; }
	.cb-text { display:flex; flex-direction:column; gap:2px; }
	.settings-actions { display:flex; align-items:center; gap:12px; }
	.saved { font-size:12px; font-weight:700; color:#24c982; }
	.settings-error { display:flex; align-items:center; gap:7px; padding:9px 12px; border-radius:10px; background:rgba(220,40,40,.1); color:#c43a46; font-size:12px; }
	.card-title { display:flex; align-items:center; gap:8px; }
	.notification-bulk { display:flex; gap:8px; align-items:center; margin-left:auto; }
	.notification-bulk .admin-select { width:170px; height:38px; font-size:13px; }
	.notification-bulk .admin-btn { height:38px; }
	.channel-notification-list { display:grid; gap:4px; max-height:380px; overflow-y:auto; }
	.channel-notification-row { display:flex; align-items:center; gap:12px; padding:9px 8px; border-radius:10px; }
	.channel-notification-row:hover { background:rgba(255,255,255,.24); }
	.channel-copy { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
	.channel-copy strong { font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.channel-copy span { font-size:11px; color:var(--muted-soft); }
	.channel-notification-select { width:170px; height:38px; font-size:13px; }
	.empty { color:var(--muted-soft); font-size:13px; padding:18px; text-align:center; }
	@media(max-width:700px) {
		.channel-notification-card .admin-card-head { align-items:flex-start; flex-direction:column; }
		.notification-bulk { width:100%; margin-left:0; flex-wrap:wrap; }
		.notification-bulk .admin-select { flex:1; min-width:150px; }
		.channel-notification-select { width:145px; }
	}
</style>

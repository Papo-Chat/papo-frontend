<script lang="ts">
	import * as settingsStore from '$lib/store/settings.svelte';
	import * as channelsStore from '$lib/store/channels.svelte';
	import { state as sessionState } from '$lib/store/session.svelte';
	import {
		clearNotificationSound,
		notificationSoundInfo,
		playNotificationSound,
		setNotificationSound,
		type NotificationSoundInfo
	} from '$lib/utils/notification-sound';
	import type { Channel, NotificationSettings, UserConfig } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import { api } from '$lib/api';
	import { isValidPassword, minPasswordLength } from '$lib/utils/password';

	let config: UserConfig | null = $state(null);
	let seededVersion = $state(-1);
	let saving = $state(false);
	let saved = $state(false);
	let channelSaved = $state(false);
	let error = $state<string | null>(null);
	let savedTimer: ReturnType<typeof setTimeout> | null = null;
	let channelSavedTimer: ReturnType<typeof setTimeout> | null = null;
	let allNotificationSetting = $state<NotificationSettings>('only_mentions');
	let applyingAll = $state(false);
	let channelSaving = $state(new Set<string>());
	let soundInfo = $state<NotificationSoundInfo>({ name: 'MSN padrão', type: 'audio/mpeg', custom: false });
	let soundSaving = $state(false);
	let soundInput: HTMLInputElement | null = null;
	let newPassword = $state('');
	let confirmPassword = $state('');
	let passwordSaving = $state(false);
	let passwordSaved = $state(false);
	const passwordCheck = $derived(isValidPassword(newPassword));

	function isNotCategoryChannel(channel: Channel | undefined): channel is Channel {
		return channel !== undefined && channel.type !== 'category';
	}

	const channels = $derived(
		channelsStore.state.ordered
			.map((id) => channelsStore.state.byId.get(id))
			.filter(isNotCategoryChannel)
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

	async function refreshSoundInfo(): Promise<void> {
		if (!sessionState.userId) return;
		soundInfo = await notificationSoundInfo(sessionState.userId);
	}

	$effect(() => {
		const userId = sessionState.userId;
		if (!userId) return;
		void refreshSoundInfo();
	});

	async function chooseSound(e: Event): Promise<void> {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file || !sessionState.userId || soundSaving) return;
		soundSaving = true;
		error = null;
		try {
			await setNotificationSound(sessionState.userId, file);
			await refreshSoundInfo();
			await playNotificationSound(sessionState.userId);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao salvar som.';
		} finally {
			soundSaving = false;
			if (soundInput) soundInput.value = '';
		}
	}

	async function restoreDefaultSound(): Promise<void> {
		if (!sessionState.userId || soundSaving) return;
		soundSaving = true;
		error = null;
		try {
			await clearNotificationSound(sessionState.userId);
			await refreshSoundInfo();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao restaurar som padrão.';
		} finally {
			soundSaving = false;
		}
	}

	async function testSound(): Promise<void> {
		if (!sessionState.userId) return;
		await playNotificationSound(sessionState.userId);
	}

	async function save(): Promise<void> {
		if (!config || saving) return;

		// Normalize values produced by the old UI before sending them to the
		// current backend enum contract.
		const rawFont = String(config.display.fontSize);
		const rawDensity = String(config.display.messageDensity);
		const fontSize =
			rawFont === 'small' || rawFont === 'medium' || rawFont === 'huge'
				? rawFont
				: rawFont === 'large'
					? 'huge'
					: 'medium';
		const messageDensity =
			rawDensity === 'compact' || rawDensity === 'normal' || rawDensity === 'comfortable'
				? rawDensity
				: rawDensity === 'spacious'
					? 'comfortable'
					: 'normal';

		saving = true;
		saved = false;
		error = null;
		try {
			await settingsStore.update({
				theme: config.theme,
				notifications: { ...config.notifications },
				display: { ...config.display, fontSize, messageDensity }
			});
			saved = true;
			if (savedTimer) clearTimeout(savedTimer);
			savedTimer = setTimeout(() => (saved = false), 1800);
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
			channelSaved = true;
			if (channelSavedTimer) clearTimeout(channelSavedTimer);
			channelSavedTimer = setTimeout(() => (channelSaved = false), 1800);
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
			channelSaved = true;
			if (channelSavedTimer) clearTimeout(channelSavedTimer);
			channelSavedTimer = setTimeout(() => (channelSaved = false), 1800);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao atualizar todos os canais.';
		} finally {
			applyingAll = false;
		}
	}

	async function changePassword(): Promise<void> {
		if (!sessionState.userId || passwordSaving) return;
		error = null;
		passwordSaved = false;
		if (!passwordCheck.ok) {
			error = passwordCheck.errors[0] ?? 'Senha inválida.';
			return;
		}
		if (newPassword !== confirmPassword) {
			error = 'As senhas não coincidem.';
			return;
		}
		passwordSaving = true;
		try {
			await api.users.changePassword(sessionState.userId, { password: newPassword });
			newPassword = '';
			confirmPassword = '';
			passwordSaved = true;
			setTimeout(() => (passwordSaved = false), 1800);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao alterar senha.';
		} finally {
			passwordSaving = false;
		}
	}

	function notificationLabel(value: NotificationSettings): string {
		if (value === 'all') return 'Todas';
		if (value === 'only_mentions') return 'Somente menções';
		return 'Nada';
	}
</script>

<div class="settings-page">
	<div class="admin-card">
		<div class="admin-card-head">
			<Icon name="lock-key" variant="duotone" size={16} />
			Segurança
		</div>
		<div class="admin-card-body">
			<div class="admin-field">
				<label for="set-new-password">Nova senha</label>
				<input id="set-new-password" class="admin-input" type="password" bind:value={newPassword} autocomplete="new-password" />
			</div>
			<div class="password-rules">
				<span class:ok={newPassword.length >= minPasswordLength}>✓ {minPasswordLength}+ caracteres</span>
				<span class:ok={/[A-Z]/.test(newPassword)}>✓ 1 letra maiúscula</span>
				<span class:ok={/[^A-Za-z0-9]/.test(newPassword)}>✓ 1 caractere especial</span>
			</div>
			<div class="admin-field">
				<label for="set-confirm-password">Confirmar nova senha</label>
				<input id="set-confirm-password" class="admin-input" type="password" bind:value={confirmPassword} autocomplete="new-password" />
			</div>
			<div class="password-actions">
				<button class="admin-btn" type="button" onclick={changePassword}
					disabled={passwordSaving || !passwordCheck.ok || newPassword !== confirmPassword}>
					{passwordSaving ? 'Alterando…' : 'Alterar senha'}
				</button>
				{#if passwordSaved}<span class="channel-saved">Senha alterada.</span>{/if}
			</div>
		</div>
	</div>
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
						<span class="hint">Tocar som ao receber uma notificação enquanto estiver online ou ausente</span>
					</span>
				</label>
				<div class="sound-setting">
					<div class="sound-copy">
						<strong>Som de notificação</strong>
						<span>{soundInfo.name}</span>
					</div>
					<div class="sound-actions">
						<input
							bind:this={soundInput}
							class="sound-file-input"
							type="file"
							accept=".mp3,.ogg,audio/mpeg,audio/ogg"
							onchange={chooseSound}
						/>
						<button class="admin-btn" type="button" onclick={() => soundInput?.click()} disabled={soundSaving}>
							<Icon name="upload-simple" variant="light" />
							Alterar
						</button>
						<button class="admin-btn" type="button" onclick={testSound}>
							<Icon name="speaker-high" variant="light" />
							Testar
						</button>
						{#if soundInfo.custom}
							<button class="admin-btn" type="button" onclick={restoreDefaultSound} disabled={soundSaving}>
								Padrão
							</button>
						{/if}
					</div>
				</div>
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
			{#if channelSaved}
				<div class="channel-saved" aria-live="polite">Notificações atualizadas.</div>
			{/if}
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
						<option value="medium">Normal</option>
						<option value="huge">Grande</option>
					</select>
				</div>
				<div class="admin-field">
					<label for="set-density">Densidade</label>
					<select id="set-density" class="admin-select" bind:value={config.display.messageDensity}>
						<option value="compact">Compacta</option>
						<option value="normal">Normal</option>
						<option value="comfortable">Confortável</option>
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
	.password-rules { display:flex; flex-wrap:wrap; gap:6px 12px; margin-top:-4px; font-size:12px; color:var(--muted-soft); }
	.password-rules span.ok { color:#24a46d; }
	.password-actions { display:flex; align-items:center; gap:10px; }

	.settings-page { padding:4px 0 8px; display:grid; gap:14px; }
	.cb-text { display:flex; flex-direction:column; gap:2px; }
	.settings-actions { display:flex; align-items:center; gap:12px; }
	.saved { font-size:12px; font-weight:700; color:#24c982; }
	.settings-error { display:flex; align-items:center; gap:7px; padding:9px 12px; border-radius:10px; background:rgba(220,40,40,.1); color:#c43a46; font-size:12px; }
	.card-title { display:flex; align-items:center; gap:8px; }
	.notification-bulk { display:flex; gap:8px; align-items:center; margin-left:auto; }
	.notification-bulk .admin-select { width:170px; height:38px; font-size:13px; }
	.notification-bulk .admin-btn { height:38px; }
	.channel-saved { margin:0 14px 8px; font-size:12px; font-weight:700; color:#24c982; }
	.channel-notification-list { display:grid; gap:4px; max-height:380px; overflow-y:auto; }
	.channel-notification-row { display:flex; align-items:center; gap:12px; padding:9px 8px; border-radius:10px; }
	.channel-notification-row:hover { background:rgba(255,255,255,.24); }
	.channel-copy { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
	.channel-copy strong { font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.channel-copy span { font-size:11px; color:var(--muted-soft); }
	.channel-notification-select { width:170px; height:38px; font-size:13px; }
	.empty { color:var(--muted-soft); font-size:13px; padding:18px; text-align:center; }
	.sound-setting { display:flex; align-items:center; gap:12px; padding:10px 0 2px; border-top:1px solid var(--border); }
	.sound-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:2px; }
	.sound-copy strong { font-size:13px; color:var(--text-primary); }
	.sound-copy span { font-size:11px; color:var(--muted-soft); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.sound-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
	.sound-file-input { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
	:global([data-theme='dark']) .sound-setting { border-color:rgba(180,220,245,.12); }
	:global(html[data-ui-flat]) .sound-setting { background:transparent; }
	@media(max-width:700px) {
		.channel-notification-card .admin-card-head { align-items:flex-start; flex-direction:column; }
		.notification-bulk { width:100%; margin-left:0; flex-wrap:wrap; }
		.notification-bulk .admin-select { flex:1; min-width:150px; }
		.channel-notification-select { width:145px; }
		.sound-setting { align-items:flex-start; flex-direction:column; }
		.sound-actions { justify-content:flex-start; }
	}
</style>

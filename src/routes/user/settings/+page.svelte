<script lang="ts">
	// User settings (notifications + display). Demo only — local state seeded
	// with sensible defaults; shape matches UserConfig (UserConfigNotifications
	// + UserConfigDisplay) so it can bind to the real settings store later.
	import { sampleMe } from '$lib/sample';
	import Icon from '$lib/components/Icon.svelte';

	let notifications = $state({
		enabled: true,
		messagePreview: true,
		sound: true,
		mentions: true
	});
	let display = $state({
		fontSize: 'normal' as string,
		messageDensity: 'comfortable' as string,
		showTimestamps: true,
		showAvatars: true
	});
	let saved = $state(false);

	function save(): void {
		// Demo: no API.
		saved = true;
	}
</script>

<div class="settings-page">
	<div class="admin-card">
		<div class="admin-card-head">
			<Icon name="bell" variant="duotone" size={16} />
			Notificações
		</div>
		<div class="admin-card-body">
			<label class="admin-checkbox">
				<input type="checkbox" bind:checked={notifications.enabled} />
				<span class="cb-text">
					<strong>Todas as notificações</strong>
					<span class="hint">Ativar ou desativar as notificações</span>
				</span>
			</label>
			<label class="admin-checkbox">
				<input type="checkbox" bind:checked={notifications.messagePreview} />
				<span class="cb-text">
					<strong>Prévia de mensagens</strong>
					<span class="hint">Mostrar o conteúdo na notificação</span>
				</span>
			</label>
			<label class="admin-checkbox">
				<input type="checkbox" bind:checked={notifications.sound} />
				<span class="cb-text">
					<strong>Som</strong>
					<span class="hint">Tocar som ao receber uma notificação</span>
				</span>
			</label>
			<label class="admin-checkbox">
				<input type="checkbox" bind:checked={notifications.mentions} />
				<span class="cb-text">
					<strong>Menções</strong>
					<span class="hint">Somente notificar quando for mencionado</span>
				</span>
			</label>
		</div>
	</div>

	<div class="admin-card">
		<div class="admin-card-head">
			<Icon name="display" variant="duotone" size={16} />
			Aparência
		</div>
		<div class="admin-card-body">
			<div class="admin-field">
				<label for="set-font">Tamanho da fonte</label>
				<select id="set-font" class="admin-select" bind:value={display.fontSize}>
					<option class="admin-option" value="small">Pequena</option>
					<option class="admin-option" value="normal">Normal</option>
					<option class="admin-option" value="large">Grande</option>
				</select>
			</div>
			<div class="admin-field">
				<label for="set-density">Densidade</label>
				<select id="set-density" class="admin-select" bind:value={display.messageDensity}>
					<option class="admin-option" value="compact">Compacta</option>
					<option class="admin-option" value="comfortable">Confortável</option>
					<option class="admin-option" value="spacious">Espaça</option>
				</select>
			</div>
			<label class="admin-checkbox">
				<input type="checkbox" bind:checked={display.showTimestamps} />
				<span class="cb-text">
					<strong>Mostrar timestamps</strong>
					<span class="hint">Exibir data e hora abaixo das mensagens</span>
				</span>
			</label>
			<label class="admin-checkbox">
				<input type="checkbox" bind:checked={display.showAvatars} />
				<span class="cb-text">
					<strong>Mostrar avatares</strong>
					<span class="hint">Exibir avatar ao lado de cada mensagem</span>
				</span>
			</label>
		</div>
	</div>

	<div class="settings-actions">
		<button class="admin-btn" onclick={save}>
			<Icon name="check" variant="light" />
			Salvar alterações
		</button>
		{#if saved}
			<span class="saved">Alterações salvas</span>
		{/if}
	</div>
</div>

<style>
	.settings-page {
		padding: 4px 0 8px;
	}
	.cb-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.settings-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 4px;
	}
	.saved {
		font-size: 12px;
		font-weight: 700;
		color: #24c982;
	}
</style>

<script lang="ts">
	// Channels: list + create + edit + permissions. Demo only — no API.
	import { sampleChannels, sampleRoles } from '$lib/sample';
	import type { Channel, ChannelPermission, ChannelType, NotificationSettings } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import PermissionTable from '$lib/components/PermissionTable.svelte';

	const typeLabel: Record<ChannelType, string> = {
		text: 'Texto',
		category: 'Categoria',
		voice: 'Voz'
	};

	// Local copy so the demo can add/remove channels.
	let channels = $state<Channel[]>([...sampleChannels]);
	let selectedId = $state<string | null>(channels[0]?.id ?? null);
	let creating = $state(false);
	let newName = $state('');
	let newType = $state<ChannelType>('text');
	let filter = $state('');

	const selected = $derived(
		channels.find((c) => c.id === selectedId) ?? null
	);

	const visibleChannels = $derived(
		filter
			? channels.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
			: channels
	);

	function select(c: Channel): void {
		selectedId = c.id;
		creating = false;
	}

	function addChannel(): void {
		const name = newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
		if (!name) return;
		const channel: Channel = {
			id: `chan-${name}`,
			name,
			type: newType,
			position: channels.length,
			permissions: [],
			created_at: new Date().toISOString(),
			topic: null,
			last_message: null,
			last_read_message: null,
			last_read_at: null,
			notification_settings: 'off'
		};
		channels.push(channel);
		select(channel);
		newName = '';
		newType = 'text';
		creating = false;
	}

	function removeChannel(id: string): void {
		channels = channels.filter((c) => c.id !== id);
		if (selectedId === id) selectedId = channels[0]?.id ?? null;
	}

	const channelPerms = $derived<Record<string, ChannelPermission>>(
		Object.fromEntries(
			sampleRoles.map((r) => [
				r.id,
				{
					read_channel: r.permissions.manage_channels ?? false,
					send_messages: r.permissions.everyone_message ?? false,
					delete_messages: r.permissions.ban_members ?? false,
					connect_voice: r.permissions.send_attachment ?? false
				}
			])
		)
	);
</script>

<div class="channels-page">
	<header class="channels-head">
		<h2>Canais</h2>
		<div class="channels-actions">
			<input
				class="admin-input filter-input"
				placeholder="Filtrar canais…"
				bind:value={filter}
				aria-label="Filtrar canais"
			/>
			<button class="admin-btn" onclick={() => (creating = !creating)}>
				<Icon name="plus" variant="light" />
				Novo canal
			</button>
		</div>
	</header>

	{#if creating}
		<div class="new-channel">
			<input
				class="admin-input"
				placeholder="nome do canal"
				bind:value={newName}
				aria-label="Nome do canal"
			/>
			<select class="admin-select" bind:value={newType} aria-label="Tipo do canal">
				<option value="text">Texto</option>
				<option value="category">Categoria</option>
				<option value="voice">Voz</option>
			</select>
			<button class="admin-btn" onclick={addChannel}>
				Criar
			</button>
		</div>
	{/if}

	<div class="admin-grid-2 channels-grid">
		<div class="admin-card channels-list-card">
			<div class="admin-card-head">
				<Icon name="chat" variant="duotone" size={16} />
				Lista
			</div>
			<div class="admin-card-body channels-list">
				{#each visibleChannels as c (c.id)}
					<div class="channel-row-wrap">
						<button
							class="channel-row {selectedId === c.id ? 'selected' : ''}"
							aria-current={selectedId === c.id ? 'page' : undefined}
							onclick={() => select(c)}
						>
							<div class="channel-row-name">
								<span class="type-badge {c.type}">{typeLabel[c.type]}</span>
								{c.name}
							</div>
							<span class="channel-row-type">{c.type}</span>
						</button>
						<button
							class="channel-row-del"
							aria-label={`Remover canal ${c.name}`}
							onclick={() => removeChannel(c.id)}
						>
							<Icon name="trash" variant="light" size={14} />
						</button>
					</div>
				{/each}
			</div>
		</div>

		{#if selected}
			<div class="admin-card channels-edit">
				<div class="admin-card-head">
					<Icon name="wrench" variant="duotone" size={16} />
					Editar — {selected.name}
				</div>
				<div class="admin-card-body">
					{#if selected.type !== 'category'}
						<div class="admin-field">
							<label for="ch-topic">Tópico</label>
							<input
								id="ch-topic"
								class="admin-input"
								value={selected.topic ?? ''}
								placeholder="Descrição do canal"
							/>
						</div>
						<div class="admin-field">
							<label for="ch-notif">Notificações</label>
							<select
								id="ch-notif"
								class="admin-select"
								value={selected.notification_settings}
							>
								<option value="off">Sem notificações</option>
								<option value="only_mentions">Somente menções</option>
								<option value="all">Todas</option>
							</select>
						</div>
					{:else}
						<div class="admin-stat">
							<span>Categoria</span>
							<strong>{selected.name}</strong>
						</div>
					{/if}
					{#if selected.type !== 'category'}
						<div class="admin-field permissions-block">
							<label>Permissões por Role</label>
							<PermissionTable perms={channelPerms} />
						</div>
					{/if}
					<div class="admin-stat">
						<span>Criado</span>
						<strong>{selected.created_at}</strong>
					</div>
				</div>
			</div>
		{:else}
			<div class="admin-card channels-edit empty-edit">
				<div class="empty">Selecione um canal para editar</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.channels-page{
		padding: 4px 0 8px;
	}
	.channels-head{
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 12px;
	}
	.channels-head h2{
		margin: 0;
		font-size: 20px;
	}
	.channels-actions{
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.channels-actions .filter-input{
		width: 160px;
	}
	.new-channel{
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}
	.new-channel .admin-input{
		flex: 1;
		min-width: 180px;
	}
	.new-channel .admin-select{
		width: 150px;
	}
	.channels-list{
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 440px;
		overflow-y: auto;
		scroll-behavior: smooth;
		scrollbar-width: thin;
		scrollbar-color: rgba(72,130,170,.28) transparent;
	}
	.channels-list::-webkit-scrollbar{ width: 10px; }
	.channels-list::-webkit-scrollbar-thumb{
		background: rgba(72,130,170,.22);
		border-radius: 999px;
		border: 3px solid transparent;
		background-clip: padding-box;
	}
	.channel-row-wrap{
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
	}
	.channel-row{
		flex: 1;
		min-width: 0;
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: center;
		gap: 8px;
		padding: 9px 10px;
		border: none;
		border-radius: 10px;
		background: transparent;
		font: inherit;
		text-align: left;
		color: var(--text);
		cursor: pointer;
		transition: .14s var(--ease);
	}
	.channel-row:hover{
		background: rgba(255, 255, 255, 0.3);
	}
	:global([data-theme="dark"]) .channel-row:hover{
		background: rgba(119,194,235,.085);
	}
	.channel-row.selected{
		background: rgba(100, 196, 250, 0.16);
		box-shadow: inset 0 0 0 1px rgba(100, 196, 250, 0.4);
	}
	.channel-row-name{
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 700;
		font-size: 13px;
	}
	.type-badge{
		font-size: 9px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 2px 6px;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.4);
		color: var(--muted);
	}
	.type-badge.voice{
		background: rgba(240, 61, 94, 0.18);
		color: #f03d5e;
	}
	.type-badge.category{
		background: rgba(239, 248, 252, 0.5);
	}
	:global([data-theme="dark"]) .type-badge{
		background: rgba(119,194,235,.14);
	}
	:global([data-theme="dark"]) .type-badge.category{
		background: rgba(119,194,235,.18);
	}
	.channel-row-type{
		font-size: 10px;
		color: var(--muted-soft);
		text-align: right;
	}
	.channel-row-del{
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 8px;
		background: transparent;
		cursor: pointer;
		opacity: 0.5;
		transition: .14s var(--ease);
	}
	.channel-row-del:hover{
		opacity: 1;
		background: rgba(240, 61, 94, 0.14);
		color: #f03d5e;
	}
	.permissions-block{
		margin-top: 4px;
	}
	.permissions-block label{
		font-size: 12px;
		font-weight: 700;
		color: var(--link-muted);
		margin-bottom: 8px;
		display: block;
	}
	.empty-edit{
		display: grid;
		place-items: center;
		min-height: 220px;
	}
	.empty{
		font-size: 13px;
		color: var(--muted-soft);
	}
	@media (max-width: 900px){
		.channels-grid{
			grid-template-columns: 1fr;
		}
	}
</style>

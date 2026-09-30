<script lang="ts">
	import * as channelsStore from '$lib/store/channels.svelte';
	import * as rolesStore from '$lib/store/roles.svelte';
	import type { Channel, ChannelPermission, ChannelType } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import PermissionTable from '$lib/components/PermissionTable.svelte';

	const typeLabel: Record<ChannelType, string> = {
		text: 'Texto',
		category: 'Categoria',
		voice: 'Voz'
	};

	let selectedId = $state<string | null>(null);
	let creating = $state(false);
	let newName = $state('');
	let newType = $state<ChannelType>('text');
	let newTopic = $state('');
	let filter = $state('');
	let editName = $state('');
	let editTopic = $state('');
	let channelPerms = $state<Record<string, ChannelPermission>>({});
	let loadingPerms = $state(false);
	let saving = $state(false);
	let success = $state('');
	let error = $state<string | null>(null);
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
	let permGeneration = 0;

	const channels = $derived(
		channelsStore.state.ordered
			.map((id) => channelsStore.state.byId.get(id))
			.filter((c): c is Channel => !!c)
	);
	const roles = $derived(rolesStore.state.list);
	const selected = $derived(channels.find((c) => c.id === selectedId) ?? null);
	const visibleChannels = $derived(
		filter
			? channels.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase()))
			: channels
	);

	$effect(() => {
		if (!channelsStore.state.loaded && !channelsStore.state.loading) void channelsStore.load();
	});

	$effect(() => {
		if (!rolesStore.state.loaded) void rolesStore.load();
	});

	$effect(() => {
		if (!selectedId && channels.length) selectedId = channels[0].id;
	});

	$effect(() => {
		const channel = selected;
		if (!channel) return;
		editName = channel.name;
		editTopic = channel.topic ?? '';
		void loadPermissions(channel.id);
	});

	async function loadPermissions(channelId: string): Promise<void> {
		const gen = ++permGeneration;
		loadingPerms = true;
		try {
			const entries = await channelsStore.getPermissions(channelId);
			if (gen !== permGeneration) return;
			channelPerms = Object.fromEntries(entries.map((e) => [e.role_id, e.permissions]));
		} catch (err) {
			if (gen === permGeneration) {
				error = err instanceof Error ? err.message : 'Erro ao carregar permissões.';
			}
		} finally {
			if (gen === permGeneration) loadingPerms = false;
		}
	}

	function select(channel: Channel): void {
		selectedId = channel.id;
		creating = false;
		error = null;
	}

	async function addChannel(): Promise<void> {
		const name = newName.trim();
		if (!name || saving) return;
		saving = true;
		error = null;
		success = '';
		try {
			const channel = await channelsStore.create({
				name,
				type: newType,
				topic: newType === 'category' ? null : newTopic.trim() || null
			});
			await channelsStore.load();
			selectedId = channel.id;
			newName = '';
			newType = 'text';
			newTopic = '';
			creating = false;
			success = 'Canal criado.';
			if (feedbackTimer) clearTimeout(feedbackTimer);
			feedbackTimer = setTimeout(() => (success = ''), 1800);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao criar canal.';
		} finally {
			saving = false;
		}
	}

	async function saveChannel(): Promise<void> {
		if (!selected || saving) return;
		const name = editName.trim();
		if (!name) return;
		saving = true;
		error = null;
		success = '';
		try {
			await channelsStore.update(selected.id, {
				name,
				topic: selected.type === 'category' ? null : editTopic.trim() || null
			});
			success = 'Canal salvo.';
			if (feedbackTimer) clearTimeout(feedbackTimer);
			feedbackTimer = setTimeout(() => (success = ''), 1800);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao salvar canal.';
		} finally {
			saving = false;
		}
	}

	async function removeChannel(id: string): Promise<void> {
		if (saving) return;
		saving = true;
		error = null;
		success = '';
		try {
			await channelsStore.remove(id);
			if (selectedId === id) selectedId = channelsStore.state.ordered[0] ?? null;
			success = 'Canal removido.';
			if (feedbackTimer) clearTimeout(feedbackTimer);
			feedbackTimer = setTimeout(() => (success = ''), 1800);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao remover canal.';
		} finally {
			saving = false;
		}
	}

	async function moveChannel(channel: Channel, delta: -1 | 1): Promise<void> {
		const index = channels.findIndex((c) => c.id === channel.id);
		const target = channels[index + delta];
		if (!target || saving) return;

		saving = true;
		error = null;
		success = '';
		try {
			await channelsStore.changePosition(channel.id, {
				old_position: channel.position,
				new_position: target.position
			});
			selectedId = channel.id;
			success = 'Ordem dos canais atualizada.';
			if (feedbackTimer) clearTimeout(feedbackTimer);
			feedbackTimer = setTimeout(() => (success = ''), 1800);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao reordenar canal.';
		} finally {
			saving = false;
		}
	}

	async function togglePermission(
		roleId: string,
		key: keyof ChannelPermission,
		value: boolean
	): Promise<void> {
		if (!selected) return;
		const before = channelPerms[roleId] ?? {
			read_channel: false,
			send_messages: false,
			delete_messages: false,
			connect_voice: false
		};
		const next = { ...before, [key]: value };
		channelPerms = { ...channelPerms, [roleId]: next };
		try {
			await channelsStore.setRolePermissions(selected.id, roleId, next);
		} catch (err) {
			channelPerms = { ...channelPerms, [roleId]: before };
			error = err instanceof Error ? err.message : 'Erro ao atualizar permissão.';
		}
	}
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

	{#if error}
		<div class="admin-error" role="alert">{error}</div>
	{:else if success}
		<div class="admin-success" aria-live="polite">{success}</div>
	{/if}

	{#if creating}
		<div class="new-channel">
			<input class="admin-input" placeholder="nome do canal" bind:value={newName} />
			<select class="admin-select" bind:value={newType}>
				<option value="text">Texto</option>
				<option value="category">Categoria</option>
				<option value="voice">Voz</option>
			</select>
			{#if newType !== 'category'}
				<input class="admin-input" placeholder="tópico (opcional)" bind:value={newTopic} />
			{/if}
			<button class="admin-btn" onclick={addChannel} disabled={saving}>Criar</button>
		</div>
	{/if}

	<div class="admin-grid-2 channels-grid">
		<div class="admin-card channels-list-card">
			<div class="admin-card-head">
				<Icon name="chat" variant="duotone" size={16} />
				Lista
			</div>
			<div class="admin-card-body channels-list">
				{#if channelsStore.state.loading && channels.length === 0}
					<div class="empty">Carregando canais…</div>
				{:else}
					{#each visibleChannels as channel (channel.id)}
						<div class="channel-row-wrap">
							<button
								class="channel-row {selectedId === channel.id ? 'selected' : ''}"
								onclick={() => select(channel)}
							>
								<div class="channel-row-name">
									<span class="type-badge {channel.type}">{typeLabel[channel.type]}</span>
									{channel.name}
								</div>
								<span class="channel-row-type">{channel.position}</span>
							</button>
							<div class="channel-row-actions">
								<button
									class="channel-row-move"
									aria-label={`Mover ${channel.name} para cima`}
									title="Mover para cima"
									disabled={channels[0]?.id === channel.id || saving}
									onclick={() => void moveChannel(channel, -1)}
								>
									<Icon name="caret-up" variant="light" size={14} />
								</button>
								<button
									class="channel-row-move"
									aria-label={`Mover ${channel.name} para baixo`}
									title="Mover para baixo"
									disabled={channels[channels.length - 1]?.id === channel.id || saving}
									onclick={() => void moveChannel(channel, 1)}
								>
									<Icon name="caret-down" variant="light" size={14} />
								</button>
								<button
									class="channel-row-del"
									aria-label={`Remover canal ${channel.name}`}
									onclick={() => void removeChannel(channel.id)}
								>
									<Icon name="trash" variant="light" size={14} />
								</button>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		</div>

		{#if selected}
			<div class="admin-card channels-edit">
				<div class="admin-card-head">
					<Icon name="wrench" variant="duotone" size={16} />
					Editar — {selected.name}
				</div>
				<div class="admin-card-body">
					<div class="admin-field">
						<label for="ch-name">Nome</label>
						<input id="ch-name" class="admin-input" bind:value={editName} />
					</div>
					{#if selected.type !== 'category'}
						<div class="admin-field">
							<label for="ch-topic">Tópico</label>
							<input id="ch-topic" class="admin-input" bind:value={editTopic} />
						</div>
					{/if}

					<button class="admin-btn" onclick={saveChannel} disabled={saving}>Salvar canal</button>

					{#if selected.type !== 'category'}
						<div class="admin-field permissions-block">
							<label>Permissões por Role</label>
							{#if loadingPerms}
								<div class="empty">Carregando permissões…</div>
							{:else}
								<PermissionTable perms={channelPerms} {roles} onToggle={togglePermission} />
							{/if}
						</div>
					{/if}

					<div class="admin-stat">
						<span>Criado</span>
						<strong>{new Date(selected.created_at).toLocaleString()}</strong>
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
	.channels-page { padding: 4px 0 8px; }
	.channels-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:12px; }
	.channels-head h2 { margin:0; font-size:20px; }
	.channels-actions, .new-channel { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
	.channels-actions .filter-input { width:160px; }
	.new-channel { margin-bottom:12px; }
	.new-channel .admin-input { flex:1; min-width:170px; }
	.new-channel .admin-select { width:140px; }
	.channels-list { display:flex; flex-direction:column; gap:2px; max-height:460px; overflow-y:auto; }
	.channel-row-wrap { display:flex; align-items:center; gap:6px; width:100%; }
	.channel-row { flex:1; min-width:0; display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px; padding:9px 10px; border:0; border-radius:10px; background:transparent; color:var(--text); font:inherit; text-align:left; cursor:pointer; }
	.channel-row:hover { background:rgba(255,255,255,.3); }
	.channel-row.selected { background:rgba(100,196,250,.16); box-shadow:inset 0 0 0 1px rgba(100,196,250,.4); }
	.channel-row-name { display:flex; align-items:center; gap:8px; font-weight:700; font-size:13px; min-width:0; }
	.channel-row-type { color:var(--muted-soft); font-size:10px; }
	.type-badge { font-size:9px; font-weight:800; text-transform:uppercase; padding:2px 6px; border-radius:6px; background:rgba(255,255,255,.4); color:var(--muted); }
	.type-badge.voice { background:rgba(240,61,94,.18); color:#f03d5e; }
	.channel-row-actions { display:flex; align-items:center; gap:2px; }
	.channel-row-move,
	.channel-row-del { display:grid; place-items:center; width:28px; height:28px; border:0; border-radius:8px; background:transparent; cursor:pointer; opacity:.55; color:var(--text); }
	.channel-row-move:hover:not(:disabled) { opacity:1; background:rgba(100,196,250,.14); color:var(--link); }
	.channel-row-move:disabled { opacity:.18; cursor:default; }
	.channel-row-del:hover { opacity:1; background:rgba(240,61,94,.14); color:#f03d5e; }
	.permissions-block { margin-top:18px; }
	.permissions-block > label { display:block; margin-bottom:8px; }
	.empty-edit { display:grid; place-items:center; min-height:220px; }
	.empty { color:var(--muted-soft); font-size:13px; }
	.admin-error,
	.admin-success { margin-bottom:10px; padding:8px 12px; border-radius:10px; font-size:12px; }
	.admin-error { background:rgba(220,40,40,.1); color:#c43a46; }
	.admin-success { background:rgba(36,201,130,.1); color:#199966; }
	@media (max-width:900px) { .channels-grid { grid-template-columns:1fr; } }
</style>

<script lang="ts">
	// Channel administration, rendered inside the chat shell (topbar +
	// members stay visible). Demo only — no API wiring.
	import { page } from '$app/state';
	import { sampleUsers, sampleRoles, resolveChannel } from '$lib/sample';
	import { openProfile } from '$lib/store/ui.svelte';
	import type { Channel, ChannelPermission, NotificationSettings } from '$lib/types';
	import Avatar from '$lib/components/Avatar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PermissionTable from '$lib/components/PermissionTable.svelte';
	import Topbar from '$lib/components/Topbar.svelte';

	// Resolve the channel once so it always matches the URL (id or name).
	const channel = $derived(resolveChannel(page.params.channel_id));

	// Derive per-role channel permissions from the role's general
	// permissions (demo: channel.permissions is empty in the sample).
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

	// Editable channel metadata (demo).
	let topic = $state(channel.topic ?? '');
	let notif = $state<NotificationSettings>(channel.notification_settings);

	function statusClass(status: string | null): string {
		return status === null ? '' : status;
	}
</script>

<Topbar {channel} />

<div class="channel-admin">
	<header class="channel-admin-head">
		<a
			class="admin-back"
			href={`/channels/${channel.id}`}
			aria-label="Voltar ao canal {channel.name}"
		>
			<Icon name="arrow-left" variant="light" />
			Voltar ao canal
		</a>
		<div>
			<h1>Administração — {channel.name}</h1>
			<p>
				{channel.type === 'voice'
					? 'Canal de voz'
					: channel.type === 'category'
						? 'Categoria'
						: 'Canal de texto'}
			</p>
		</div>
	</header>

	<div class="admin-grid-2">
		<div class="admin-card">
			<div class="admin-card-head">
				<Icon name="chat" variant="duotone" size={16} />
				Canal
			</div>
			<div class="admin-card-body">
				<div class="admin-field">
					<label for="ca-topic">Tópico</label>
					<input
						id="ca-topic"
						class="admin-input"
						bind:value={topic}
						placeholder="Descrição do canal"
					/>
				</div>
				<div class="admin-field">
					<label for="ca-notif">Notificações</label>
					<select id="ca-notif" class="admin-select" bind:value={notif}>
						<option class="admin-option" value="off">Sem notificações</option>
						<option class="admin-option" value="only_mentions">Somente menções</option>
						<option class="admin-option" value="all">Todas</option>
					</select>
				</div>
				<div class="admin-stat">
					<span>Criado</span>
					<strong>{channel.created_at}</strong>
				</div>
			</div>
		</div>

		<div class="admin-card">
			<div class="admin-card-head">
				<Icon name="shield-check" variant="duotone" size={16} />
				Permissões
			</div>
			<div class="admin-card-body">
				<PermissionTable perms={channelPerms} />
			</div>
		</div>
	</div>

	<div class="admin-card member-card">
		<div class="admin-card-head">
			<Icon name="users-three" variant="duotone" size={16} />
			Membros ({sampleUsers.length})
		</div>
		<div class="admin-card-body member-list">
			{#each sampleUsers as u (u.id)}
				<button
					class="admin-row member-row"
					aria-label={`Ver perfil de ${u.nickname || u.username}`}
					onclick={() => openProfile(u)}
				>
					<Avatar username={u.username} nickname={u.nickname} size={36} />
					<div class="admin-row-labels">
						<strong>{u.nickname || u.username}</strong>
						<span>
							<span class="status-dot {statusClass(u.status)}"></span>
							{u.status_message || 'Online'}
						</span>
					</div>
					<div class="admin-row-badges">
						{#each u.roles as r (r.id)}
							<span class="chip" style="color:{r.color}">{r.name}</span>
						{/each}
					</div>
				</button>
			{/each}
		</div>
	</div>
</div>

<style>
	.channel-admin {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 4px 0 12px;
		overflow-x: hidden;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: rgba(72, 130, 170, 0.28) transparent;
	}
	.channel-admin::-webkit-scrollbar {
		width: 10px;
	}
	.channel-admin::-webkit-scrollbar-thumb {
		background: rgba(72, 130, 170, 0.22);
		border-radius: 999px;
		border: 3px solid transparent;
		background-clip: padding-box;
	}
	.channel-admin-head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 14px;
	}
	.channel-admin-head h1 {
		margin: 0;
		font-size: 20px;
	}
	.channel-admin-head p {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--muted);
	}
	.member-row {
		cursor: pointer;
		background: rgba(197, 239, 255, 0.507);
	}
	:global([data-theme='dark']) .member-row {
		cursor: pointer;
		background: rgba(62, 130, 170, 0.3);
	}
	.member-row .avatar {
		border-width: 1.5px;
	}
	.channel-admin > .channel-admin-head,
	.channel-admin > .admin-grid-2 {
		flex-shrink: 0;
	}
	.channel-admin > .admin-card.member-card {
		flex: 1 1 0;
		min-height: 180px;
		display: flex;
		flex-direction: column;
	}
	.member-list {
		flex: 1;
		min-height: 0;
		max-height: none;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: rgba(72, 130, 170, 0.28) transparent;
	}
	.member-list::-webkit-scrollbar {
		width: 10px;
	}
	.member-list::-webkit-scrollbar-thumb {
		background: rgba(72, 130, 170, 0.22);
		border-radius: 999px;
		border: 3px solid transparent;
		background-clip: padding-box;
	}
</style>

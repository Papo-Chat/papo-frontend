<script lang="ts">
	// Server overview / landing (dashboard). Demo only — no API wiring.
	import {
		sampleServer,
		sampleUsers,
		sampleChannels,
		sampleRoles,
		sampleAuditLogs
	} from '$lib/sample';
	import Icon from '$lib/components/Icon.svelte';

	const online = sampleUsers.filter((u) => u.status === null);
	const channels = sampleChannels.filter((c) => c.type !== 'category');

	const timeAgo = (iso: string): string => {
		const diff = Date.now() - new Date(iso).getTime();
		const min = Math.floor(diff / 60000);
		if (min < 1) return 'agora';
		if (min < 60) return `${min} min atrás`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr} h atrás`;
		const day = Math.floor(hr / 24);
		return `${day} d atrás`;
	};
</script>

<div class="admin-page">
	<div class="kpis">
		<div class="kpi">
			<span>Membros</span>
			<strong>{sampleServer.member_count}</strong>
		</div>
		<div class="kpi">
			<span>Canais</span>
			<strong>{channels.length}</strong>
		</div>
		<div class="kpi">
			<span>Papéis</span>
			<strong>{sampleRoles.length}</strong>
		</div>
		<div class="kpi">
			<span>Ativo agora</span>
			<strong>{online.length}</strong>
		</div>
	</div>

	<div class="dashboard-lower">
		<div class="panel">
			<div class="panel-head">Atividade recente</div>
			{#each sampleAuditLogs as log (log.id)}
				<div class="activity-line">
					<span>
						{log.actor_username}
						<span class="act">{log.action}</span>
					</span>
					<span>{timeAgo(log.created_at)}</span>
				</div>
			{/each}
		</div>

		<div class="panel">
			<div class="panel-head">Online</div>
			{#each online as u (u.id)}
				<div class="activity-line online-row">
					<span class="dot online"></span>
					<span class="name">{u.nickname || u.username}</span>
					<span>
						{#if u.status_message}{u.status_message}{:else}Online{/if}
					</span>
				</div>
			{/each}
			{#if online.length === 0}
				<div class="empty">Ninguém online</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.admin-page{
		padding: 4px 0 8px;
	}
	.act{
		margin-left: 6px;
		font-weight: 800;
		color: var(--link);
		text-transform: lowercase;
	}
	.online-row .dot{
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--online);
		flex: none;
	}
	.online-row .name{
		font-weight: 700;
		color: var(--text);
	}
	.online-row span:last-child{
		text-align: right;
	}
	.empty{
		font-size: 12px;
		color: var(--muted-soft);
		padding: 8px 0;
	}
</style>

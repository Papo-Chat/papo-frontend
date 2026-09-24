<script lang="ts">
	// Audit log. Demo only — no API wiring.
	// A auditoria é uma busca (não um filtro): os primeiros 50 registros
	// vêm direto; a pesquisa, no futuro, acionará um endpoint.
	import { sampleAuditLogs } from '$lib/sample';
	import type { AuditLogEntry } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let search = $state('');

	function computeFiltered(): AuditLogEntry[] {
		if (!search) {
			return sampleAuditLogs.slice(0, 50);
		}
		const q = search.toLowerCase();
		return sampleAuditLogs.filter((l) =>
			[l.actor_username, l.action, l.entity_type, l.target_user_id ?? ''].some(
				(v) => v.toLowerCase().includes(q)
			)
		);
	}

	const filtered = $derived(computeFiltered());

	function timeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const min = Math.floor(diff / 60000);
		if (min < 1) return 'agora';
		if (min < 60) return `${min} min atrás`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr} h atrás`;
		const day = Math.floor(hr / 24);
		return `${day} d atrás`;
	}
</script>

<div class="audit-page">
	<header class="audit-head">
		<h2>Auditoria</h2>
		<div class="audit-filters">
			<input
				class="admin-input filter-input"
				placeholder="Pesquisar…"
				bind:value={search}
				aria-label="Pesquisar auditoria"
			/>
		</div>
	</header>

	<div class="admin-card">
		<div class="admin-card-head">
			<Icon name="magnifying-glass" variant="duotone" size={16} />
			Histórico ({filtered.length})
		</div>
		<div class="admin-card-body">
			{#if filtered.length === 0}
				<div class="empty">Nenhuma ação encontrada.</div>
			{:else}
				<table class="admin-table">
					<thead>
						<tr>
							<th>Quem</th>
							<th>Ação</th>
							<th>Entidade</th>
							<th>Alvo</th>
							<th>Momento</th>
						</tr>
					</thead>
					<tbody>
						{#each filtered as log (log.id)}
							<tr>
								<td>{log.actor_username}</td>
								<td>
									<span class="action-badge {log.entity_type}">{log.action}</span>
								</td>
								<td>{log.entity_type}</td>
								<td>
									{#if log.target_user_id}
										{log.target_user_id.replace('user-', '')}
									{:else}
										<span class="empty">—</span>
									{/if}
								</td>
								<td>{timeAgo(log.created_at)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	</div>
</div>

<style>
	.audit-page {
		padding: 4px 0 8px;
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.audit-page > .admin-card {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.audit-page > .admin-card .admin-card-body {
		flex: 1;
		min-height: 0;
	}
	.audit-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
		flex-wrap: wrap;
		gap: 12px;
	}
	.audit-head h2 {
		margin: 0;
		font-size: 20px;
	}
	.audit-filters {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.audit-filters .filter-input {
		width: 160px;
	}
	.audit-filter {
		height: 40px;
		border-radius: 12px;
		padding: 0 12px;
		border: 1px solid rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.4);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	:global([data-theme="dark"]) .audit-filter {
		border-color: rgba(185,224,250,.14);
		background: rgba(25,51,68,.6);
	}
	.action-badge {
		font-size: 11px;
		font-weight: 700;
		text-transform: lowercase;
		padding: 4px 8px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.5);
		color: var(--text);
	}
	.action-badge.channel {
		background: rgba(100, 196, 250, 0.18);
		color: #0b71d3;
	}
	.action-badge.role {
		background: rgba(48, 209, 88, 0.18);
		color: #1a9d45;
	}
	.action-badge.user {
		background: rgba(240, 61, 94, 0.14);
		color: #f03d5e;
	}
	.action-badge.emoji {
		background: rgba(239, 248, 252, 0.5);
		color: var(--muted);
	}
	:global([data-theme="dark"]) .action-badge {
		background: rgba(119,194,235,.14);
	}
	:global([data-theme="dark"]) .action-badge.channel {
		color: #88d7ff;
	}
	:global([data-theme="dark"]) .action-badge.role {
		color: #5fe08f;
	}
	:global([data-theme="dark"]) .action-badge.emoji {
		background: rgba(119,194,235,.14);
		color: #c9d9e8;
	}
	.empty {
		color: var(--muted-soft);
		font-size: 13px;
	}
</style>

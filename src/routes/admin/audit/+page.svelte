<script lang="ts">
	import * as api from '$lib/api';
	import type { AuditLogEntry, AuditLogFilters } from '$lib/types';
	import { nextCursor, type KeysetCursor } from '$lib/utils/keyset';
	import Icon from '$lib/components/Icon.svelte';

	// Filtros server-side (GET /admin/audit-logs). Vazios = não filtrado.
	let action = $state('');
	let actorId = $state('');
	let entityType = $state('');
	let dateFrom = $state('');
	let dateUntil = $state('');

	let logs = $state<AuditLogEntry[]>([]);
	let cursor: KeysetCursor | null = $state(null);
	let hasMore = $state(false);
	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);
	let loaded = $state(false);
	let loadGen = 0;

	function buildFilters(): AuditLogFilters {
		return {
			action: action || '',
			actor_id: actorId || '',
			entity_type: entityType || ''
		};
	}

	// Data (yyyy-mm-dd) → timestamp UTC. `since` = início do dia (>=);
	// `until` = fim do dia (<=).
	function sinceFor(v: string): string | null {
		return v ? `${v}T00:00:00.000Z` : null;
	}
	function untilFor(v: string): string | null {
		return v ? `${v}T23:59:59.999Z` : null;
	}

	// Cursor da página (oldest item) + filtros de data mantidos a cada page.
	function buildQ(lastId: string | null): {
		since?: string;
		until?: string;
		last_id?: string;
	} {
		return {
			since: sinceFor(dateFrom) ?? undefined,
			until: untilFor(dateUntil) ?? undefined,
			last_id: lastId ?? undefined
		};
	}

	async function loadPage(lastId: string | null): Promise<void> {
		error = null;
		const gen = (loadGen += 1);
		if (lastId === null) {
			loading = true;
		} else {
			loadingMore = true;
		}

		try {
			const res = await api.admin.auditLogs(buildFilters(), buildQ(lastId));
			if (gen !== loadGen) {
				return;
			}

			if (lastId === null) {
				logs = res.logs;
			} else {
				const seen = new Set(logs.map((l) => l.id));
				const fresh = res.logs.filter((l) => !seen.has(l.id));
				logs = [...logs, ...fresh];
			}

			cursor = nextCursor(res.logs);
			hasMore = res.has_more;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao carregar a auditoria.';
			if (gen === loadGen && lastId === null) {
				logs = [];
				cursor = null;
				hasMore = false;
			}
		} finally {
			if (gen === loadGen) {
				loading = false;
				loadingMore = false;
			}
		}
	}

	function applyFilters(): void {
		loadGen = 0;
		void loadPage(null);
	}

	function loadMore(): void {
		if (!cursor || !hasMore || loadingMore) {
			return;
		}
		void loadPage(cursor.last_id);
	}

	// Scroll-based loading: while the user scrolls `.admin-card-body` towards
	// the bottom (distance < 200px) and there are more pages, load the next.
	// Replaces the "Carregar mais" button (no click, same as the chat messages).
	function onBodyScroll(e: Event): void {
		const sc = e.target as HTMLElement;
		const distance = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
		if (distance < 200 && !loadingMore && hasMore) {
			loadMore();
		}
	}

	$effect(() => {
		if (loaded) {
			return;
		}
		loaded = true;
		loadGen = 0;
		void loadPage(null);
	});

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
				placeholder="Ação (ex: channel_create)"
				bind:value={action}
				aria-label="Filtro por ação"
			/>
			<input
				class="admin-input filter-input"
				placeholder="Actor ID (uuid)"
				bind:value={actorId}
				aria-label="Filtro por actor id"
			/>
			<input
				class="admin-input filter-input"
				placeholder="Entidade (user/channel/role/emoji)"
				bind:value={entityType}
				aria-label="Filtro por entidade"
			/>
			<div class="date-input">
				<label>Desde</label>
				<input type="date" bind:value={dateFrom} aria-label="Desde" />
			</div>
			<div class="date-input">
				<label>Até</label>
				<input type="date" bind:value={dateUntil} aria-label="Até" />
			</div>
			<button class="admin-btn" onclick={applyFilters} disabled={loading}>
				{loading ? 'Carregando…' : 'Aplicar'}
			</button>
		</div>
	</header>

	{#if error}
		<div class="audit-error" role="alert">
			<Icon name="warning-circle" variant="light" />
			<span>{error}</span>
		</div>
	{/if}

	<div class="admin-card">
		<div class="admin-card-head">
			<Icon name="magnifying-glass" variant="duotone" size={16} />
			Histórico ({logs.length})
		</div>
		<div class="admin-card-body" onscroll={onBodyScroll}>
			{#if loading && logs.length === 0}
				<div class="empty">Carregando…</div>
			{:else if logs.length === 0}
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
						{#each logs as log (log.id)}
							<tr>
								<td>{log.actor_username}</td>
								<td>
									<span class="action-badge {log.entity_type}">{log.action}</span>
								</td>
								<td>{log.entity_type}</td>
								<td>
									{#if log.target_user_id}
										{log.target_user_id}
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
		overflow-y: auto;
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
		justify-content: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.audit-filters .filter-input {
		width: 160px;
	}
	.date-input {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.date-input label {
		font-size: 12px;
		color: var(--muted);
	}
	.date-input input {
		height: 40px;
		border-radius: 12px;
		padding: 0 10px;
		border: 1px solid rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.4);
		color: var(--text);
		font: inherit;
	}
	.date-input input:focus {
		outline: none;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
	}
	:global([data-theme='dark']) .date-input input {
		border-color: rgba(185, 224, 250, 0.25);
		background: rgba(25, 51, 68, 0.6);
	}
	.audit-error {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		margin-bottom: 10px;
		border: 1px solid rgba(220, 40, 40, 0.5);
		border-radius: 14px;
		background: rgba(220, 40, 40, 0.1);
		color: #b91c1c;
		font-size: 13px;
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
	:global([data-theme='dark']) .action-badge {
		background: rgba(119, 194, 235, 0.14);
	}
	:global([data-theme='dark']) .action-badge.channel {
		color: #88d7ff;
	}
	:global([data-theme='dark']) .action-badge.role {
		color: #5fe08f;
	}
	:global([data-theme='dark']) .action-badge.emoji {
		background: rgba(119, 194, 235, 0.14);
		color: #c9d9e8;
	}
	.empty {
		color: var(--muted-soft);
		font-size: 13px;
	}
</style>

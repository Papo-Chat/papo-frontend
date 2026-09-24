<script lang="ts">
	// Users: list + ban + assign role. Demo only — no API wiring.
	import { sampleUsers, sampleRoles } from '$lib/sample';
	import type { UserSummary } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';

	// Local editable copy so the demo can ban / unban users.
	let users = $state<UserSummary[]>([...sampleUsers]);
	let bannedIds = $state<string[]>([]);
	let filter = $state('');

	const visibleUsers = $derived(
		filter
			? users.filter(
				(u) =>
					u.username.toLowerCase().includes(filter.toLowerCase()) ||
					(u.nickname || '').toLowerCase().includes(filter.toLowerCase())
			)
			: users
	);

	function isBanned(id: string): boolean {
		return bannedIds.includes(id);
	}

	function toggleBan(id: string): void {
		bannedIds = bannedIds.includes(id)
			? bannedIds.filter((b) => b !== id)
			: [...bannedIds, id];
	}

	function assignRole(userId: string, role: string): void {
		// Demo: no API.
		const u = users.find((x) => x.id === userId);
		if (!u) return;
		const roleEntry = sampleRoles.find((r) => r.id === role);
		if (!roleEntry || u.roles.some((r) => r.id === role)) return;
		u.roles = [...u.roles, roleEntry];
	}

	function removeRole(userId: string, roleId: string): void {
		// Demo: no API.
		const u = users.find((x) => x.id === userId);
		if (!u) return;
		u.roles = u.roles.filter((r) => r.id !== roleId);
	}

	const banned = $derived(users.filter((u) => isBanned(u.id)));
	const total = $derived(users.filter((u) => !isBanned(u.id)).length);
</script>

<div class="users-page">
	<header class="users-head">
		<h2>Usuários</h2>
		<div class="users-head-actions">
			<input
				class="admin-input filter-input"
				placeholder="Filtrar usuários…"
				bind:value={filter}
				aria-label="Filtrar usuários"
			/>
			<div class="users-stats">
				<span>Ativos: <strong>{total}</strong></span>
				<span class="banned-count">Banidos: <strong>{banned.length}</strong></span>
			</div>
		</div>
	</header>

	{#if banned.length}
		<div class="banned-card">
			<div class="banned-card-head">
				<Icon name="x-circle" variant="duotone" size={14} />
				Banidos ({banned.length})
			</div>
			<div class="banned-list">
				{#each banned as u (u.id)}
					<button
						class="banned-item"
						aria-label={`Desbanir ${u.nickname || u.username}`}
						onclick={() => toggleBan(u.id)}
					>
						${u.nickname || u.username}
						<Icon name="arrow-clockwise" variant="light" size={14} />
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="admin-card">
		<div class="admin-card-head">
			<Icon name="users-three" variant="duotone" size={16} />
			Membros
		</div>
		<div class="admin-card-body">
			<div class="users-list">
			{#each visibleUsers as u (u.id)}
				{#if !isBanned(u.id)}
					<div class="user-row">
						<Avatar username={u.username} nickname={u.nickname} size={34} />
						<div class="user-info">
							<strong>{u.nickname || u.username}</strong>
							<span class="user-user">@{u.username}</span>
						</div>
						{#if u.status === null}
							<span class="status-dot"></span>
						{:else}
							<span class="status-dot {u.status}"></span>
						{/if}
						<div class="role-select">
							<select
								class="user-role-select"
								aria-label={`Atribuir Role a ${u.nickname || u.username}`}
								onchange={(e) => {
									(e.target as HTMLSelectElement).selectedIndex = 0;
									const val = (e.target as HTMLSelectElement).value;
									if (val) assignRole(u.id, val);
								}}>
								<option value="">Atribuir Role…</option>
								{#each sampleRoles as r (r.id)}
									<option value={r.id}>{r.name}</option>
								{/each}
							</select>
						</div>
						<div class="role-chips">
							{#each u.roles as r (r.id)}
								<span class="chip" style="color:{r.color}">
									{r.name}
									<button class="chip-x" aria-label={`Remover Role ${r.name}`}>
										×
									</button>
								</span>
							{/each}
						</div>
						<button
							class="admin-btn ghost small"
							aria-label={`Banir ${u.nickname || u.username}`}
							onclick={() => toggleBan(u.id)}
						>
							<Icon name="x-circle" variant="light" size={14} />
							Banir
						</button>
					</div>
				{/if}
			{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.users-page {
		padding: 4px 0 8px;
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.users-page > .admin-card {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.users-page > .admin-card .admin-card-body {
		flex: 1;
		min-height: 0;
	}
	.users-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
		margin-bottom: 12px;
	}
	.users-head h2 {
		margin: 0;
		font-size: 20px;
	}
	.users-stats {
		display: flex;
		gap: 14px;
		font-size: 13px;
		color: var(--muted);
	}
	.users-head-actions{
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.users-head-actions .filter-input{
		width: 160px;
	}
	.users-stats strong {
		color: var(--text);
	}
	.banned-count {
		color: #f03d5e;
	}
	.banned-card {
		border-radius: 12px;
		padding: 10px;
		margin-bottom: 12px;
		background: rgba(240, 61, 94, 0.08);
		border: 1px solid rgba(240, 61, 94, 0.25);
	}
	.banned-card-head {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 700;
		color: #f03d5e;
		margin-bottom: 8px;
	}
	.banned-list {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.banned-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border: none;
		border-radius: 8px;
		background: rgba(240, 61, 94, 0.14);
		color: #fff;
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.users-list {
		flex: 1;
		min-height: 0;
		max-height: none;
		overflow-y: auto;
		scroll-behavior: smooth;
		scrollbar-width: thin;
		scrollbar-color: rgba(72, 130, 170, .28) transparent;
	}
	.users-list::-webkit-scrollbar {
		width: 10px;
	}
	.users-list::-webkit-scrollbar-thumb {
		background: rgba(72, 130, 170, .22);
		border-radius: 999px;
		border: 3px solid transparent;
		background-clip: padding-box;
	}
	.user-row {
		display: grid;
		grid-template-columns: auto 1fr auto auto 1fr auto;
		align-items: center;
		gap: 12px;
		padding: 9px 6px;
		border-radius: 12px;
		transition: 0.16s var(--ease);
	}
	.user-row:hover {
		background: rgba(255, 255, 255, 0.32);
	}
	:global([data-theme="dark"]) .user-row:hover {
		background: rgba(119,194,235,.085);
	}
	.user-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.user-info strong {
		font-size: 14px;
	}
	.user-user {
		font-size: 12px;
		color: var(--muted-soft);
	}
	.user-role-select {
		height: 34px;
		border-radius: 9px;
		padding: 0 8px;
		border: 1px solid rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.4);
		color: var(--text);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	:global([data-theme="dark"]) .user-role-select {
		border-color: rgba(185,224,250,.14);
		background: rgba(25,51,68,.6);
	}
	.role-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		position: relative;
		padding-right: 20px; /* espaço pro X */
	}
	.chip-x {
		position: absolute;
		top: 50%;
		right: 4px;
		transform: translateY(-50%);
		width: 16px;
		height: 16px;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.25);
		color: #fff;
		font-size: 10px;
		line-height: 1;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.chip-x:hover {
		background: rgba(240, 61, 94, 0.5);
	}
	.admin-btn.ghost.small {
		height: 32px;
		padding: 0 10px;
		font-size: 12px;
	}
	@media (max-width: 760px) {
		.user-row {
			grid-template-columns: auto 1fr;
			row-gap: 10px;
		}
		.user-row .role-select,
		.user-row .role-chips,
		.user-row .admin-btn.ghost {
			grid-column: 1 / -1;
		}
	}
</style>

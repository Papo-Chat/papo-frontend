<script lang="ts">
	// Users: list + ban + assign role. Data: usersStore (list + ban state)
	// + rolesStore (roles).
	import * as usersStore from '$lib/store/users.svelte';
	import { api } from '$lib/api';
	import * as rolesStore from '$lib/store/roles.svelte';
	import { state as sessionState, meId } from '$lib/store/session.svelte';
	import { state as serverState } from '$lib/store/server.svelte';
	import { can } from '$lib/store/roles.svelte';
	import type { UserSummary } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import Avatar from '$lib/components/Avatar.svelte';

	let searchQuery = $state('');
	let searchResults = $state<UserSummary[]>([]);
	let searchCursor: { since: string; last_id: string } | null = $state(null);
	let searchHasMore = $state(false);
	let searchLoading = $state(false);
	let searchGeneration = 0;
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let actionSuccess = $state('');
	let actionError = $state<string | null>(null);
	let busyUsers = $state(new Set<string>());
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

	function setFeedback(success: string, error: string | null = null): void {
		actionSuccess = error ? '' : success;
		actionError = error;
		if (feedbackTimer) clearTimeout(feedbackTimer);
		if (!error && success) {
			feedbackTimer = setTimeout(() => (actionSuccess = ''), 1800);
		}
	}

	function setUserBusy(userId: string, busy: boolean): void {
		const next = new Set(busyUsers);
		if (busy) next.add(userId);
		else next.delete(userId);
		busyUsers = next;
	}

	const me = $derived(meId());
	const isOwner = $derived(!!me && serverState.server?.owner_id === me);
	const myRoleIds = $derived(new Set(sessionState.roles.map((r) => r.id)));
	const myRoles = $derived(rolesStore.state.list.filter((r) => myRoleIds.has(r.id)));
	const adminCtx = $derived({ roles: myRoles, isOwner });
	const canManageRoles = $derived(can('manage_roles', adminCtx));
	const canManageServer = $derived(can('manage_server', adminCtx));

	// Admin consumes the same bounded directory window as Members.
	$effect(() => {
		if (usersStore.state.list.items.length === 0 && !usersStore.state.list.loading) {
			void usersStore.loadList();
		}
	});

	const users = $derived(usersStore.state.list.items);
	const roles = $derived(rolesStore.state.list);
	const isSearching = $derived(searchQuery.trim().length > 0);

	function matchesQuery(user: UserSummary, query: string): boolean {
		const q = query.toLowerCase();
		return (
			user.id.toLowerCase() === q ||
			user.username.toLowerCase().includes(q) ||
			(user.nickname || '').toLowerCase().includes(q)
		);
	}

	async function loadSearchPages(reset = false): Promise<void> {
		const query = searchQuery.trim();
		if (!query) return;

		if (reset) {
			searchGeneration += 1;
			searchResults = [];
			searchCursor = null;
			searchHasMore = true;
		} else if (searchLoading) {
			return;
		}

		const generation = searchGeneration;
		searchLoading = true;

		if (
			reset &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query)
		) {
			try {
				const user = await usersStore.ensureSummary(query);
				if (generation === searchGeneration) {
					searchResults = user ? [user] : [];
					searchHasMore = false;
				}
			} catch (err) {
				setFeedback('', err instanceof Error ? err.message : 'Erro ao buscar usuário.');
			} finally {
				if (generation === searchGeneration) searchLoading = false;
			}
			return;
		}

		try {
			let pages = 0;
			let added = 0;
			while (generation === searchGeneration && pages < 8 && searchHasMore) {
				const res = await api.users.list({
					...(searchCursor
						? { since: searchCursor.since, last_id: searchCursor.last_id }
						: {}),
					order: 'asc'
				});
				if (generation !== searchGeneration) return;

				usersStore.cacheSummaries(res.users);
				const existing = new Set(searchResults.map((user) => user.id));
				const matches = res.users.filter(
					(user) => matchesQuery(user, query) && !existing.has(user.id)
				);
				if (matches.length) {
					searchResults = [...searchResults, ...matches];
					added += matches.length;
				}

				const last = res.users.at(-1);
				searchCursor = last
					? { since: last.created_at, last_id: last.id }
					: searchCursor;
				searchHasMore = res.has_more && !!last;
				pages += 1;

				if (!searchHasMore || added >= 30) break;
				await new Promise<void>((resolve) => setTimeout(resolve, 60));
			}
		} catch (err) {
			setFeedback('', err instanceof Error ? err.message : 'Erro ao buscar usuários.');
			searchHasMore = false;
		} finally {
			if (generation === searchGeneration) {
				searchLoading = false;
				if (
					searchHasMore &&
					searchResults.length < 30 &&
					searchQuery.trim() === query
				) {
					setTimeout(() => {
						if (
							generation === searchGeneration &&
							searchQuery.trim() === query &&
							!searchLoading
						) {
							void loadSearchPages(false);
						}
					}, 120);
				}
			}
		}
	}

	$effect(() => {
		const query = searchQuery.trim();
		if (searchTimer) clearTimeout(searchTimer);
		if (!query) {
			searchGeneration += 1;
			searchResults = [];
			searchCursor = null;
			searchHasMore = false;
			searchLoading = false;
			return;
		}
		searchTimer = setTimeout(() => {
			void loadSearchPages(true);
		}, 320);
		return () => {
			if (searchTimer) clearTimeout(searchTimer);
		};
	});

	function onUsersScroll(e: Event): void {
		const sc = e.currentTarget as HTMLElement;
		const bottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
		if (isSearching) {
			if (bottom < 220 && searchHasMore && !searchLoading) {
				void loadSearchPages(false);
			}
			return;
		}
		if (bottom < 220 && usersStore.state.list.hasMoreNext && !usersStore.state.list.loading) {
			void usersStore.loadMore();
		} else if (
			sc.scrollTop < 120 &&
			usersStore.state.list.hasMorePrevious &&
			!usersStore.state.list.loading
		) {
			void usersStore.loadPrevious();
		}
	}

	const visibleUsers = $derived(
		(isSearching ? searchResults : users).map(
			(user) => usersStore.state.byId.get(user.id) ?? user
		)
	);

	const banned = $derived(visibleUsers.filter((user) => user.banned ?? usersStore.state.bannedIds.has(user.id)));
	const activeCount = $derived(visibleUsers.filter((user) => !(user.banned ?? usersStore.state.bannedIds.has(user.id))).length);

	function isBanned(id: string): boolean {
		const user = usersStore.state.byId.get(id);
		return user?.banned ?? usersStore.state.bannedIds.has(id);
	}

	async function toggleBan(u: UserSummary): Promise<void> {
		if (busyUsers.has(u.id)) return;
		setUserBusy(u.id, true);
		actionError = null;
		actionSuccess = '';
		const nextBan = !isBanned(u.id);
		try {
			await usersStore.setBanState(u.id, nextBan);
			setFeedback(nextBan ? 'Usuário banido.' : 'Usuário desbanido.');
		} catch (err) {
			setFeedback('', err instanceof Error ? err.message : 'Erro ao alterar banimento.');
		} finally {
			setUserBusy(u.id, false);
		}
	}

	async function assignRole(userId: string, roleId: string): Promise<void> {
		const role = rolesStore.state.byId.get(roleId);
		const current = usersStore.state.byId.get(userId);
		if (!current || !role || current.roles.some((r) => r.id === roleId)) return;

		if (busyUsers.has(userId)) return;
		setUserBusy(userId, true);
		actionError = null;
		actionSuccess = '';

		const before = current.roles;
		const next = { ...current, roles: [...before, role] };
		usersStore.state.list.items = usersStore.state.list.items.map((u) =>
			u.id === userId ? next : u
		);
		usersStore.state.byId.set(userId, next);

		try {
			await rolesStore.assign(userId, roleId);
			setFeedback('Role atribuída.');
		} catch (err) {
			const rollback = { ...next, roles: before };
			usersStore.state.list.items = usersStore.state.list.items.map((u) =>
				u.id === userId ? rollback : u
			);
			usersStore.state.byId.set(userId, rollback);
			setFeedback('', err instanceof Error ? err.message : 'Erro ao atribuir Role.');
		} finally {
			setUserBusy(userId, false);
		}
	}

	async function removeRole(userId: string, roleId: string): Promise<void> {
		const current = usersStore.state.byId.get(userId);
		if (!current || busyUsers.has(userId)) return;
		setUserBusy(userId, true);
		actionError = null;
		actionSuccess = '';

		const before = current.roles;
		const next = { ...current, roles: before.filter((r) => r.id !== roleId) };
		usersStore.state.list.items = usersStore.state.list.items.map((u) =>
			u.id === userId ? next : u
		);
		usersStore.state.byId.set(userId, next);

		try {
			await rolesStore.unassign(userId, roleId);
			setFeedback('Role removida.');
		} catch (err) {
			const rollback = { ...next, roles: before };
			usersStore.state.list.items = usersStore.state.list.items.map((u) =>
				u.id === userId ? rollback : u
			);
			usersStore.state.byId.set(userId, rollback);
			setFeedback('', err instanceof Error ? err.message : 'Erro ao remover Role.');
		} finally {
			setUserBusy(userId, false);
		}
	}
	function statusDotClass(id: string): string {
		const s = usersStore.effectiveStatus(id);
		if (s === 'online') return '';
		if (s === 'offline') return 'offline';
		return s;
	}

	const loading = $derived(usersStore.state.list.loading && users.length === 0);
</script>

<div class="users-page">
	<header class="users-head">
		<h2>Usuários</h2>
		<div class="users-head-actions">
			<input
				class="admin-input filter-input"
				placeholder="Buscar usuários…"
				bind:value={searchQuery}
				aria-label="Buscar usuários"
			/>
			<div class="users-stats">
				<span>Ativos: <strong>{activeCount}</strong></span>
				{#if canManageServer}
					<span class="banned-count">Banidos: <strong>{banned.length}</strong></span>
				{/if}
			</div>
		</div>
	</header>

	{#if actionError}
		<div class="user-feedback error" role="alert">{actionError}</div>
	{:else if actionSuccess}
		<div class="user-feedback success" aria-live="polite">{actionSuccess}</div>
	{/if}

	{#if loading || (isSearching && (searchLoading || searchHasMore) && searchResults.length === 0)}
		<div class="loading-hint">{isSearching ? 'Buscando usuários…' : 'Carregando usuários…'}</div>
	{:else if isSearching && !searchLoading && !searchHasMore && searchResults.length === 0}
		<div class="loading-hint">Nenhum usuário encontrado.</div>
	{/if}


	<div class="admin-card">
		<div class="admin-card-head">
			<Icon name="users-three" variant="duotone" size={16} />
			Membros
		</div>
		<div class="admin-card-body">
			<div class="users-list" onscroll={onUsersScroll}>
				{#each visibleUsers as u (u.id)}
						<div class="user-row" class:banned-row={isBanned(u.id)}>
							<Avatar user={u} size={34} />
							<div class="user-info">
								<strong>{u.nickname || u.username}</strong>
								<span class="user-user">@{u.username}</span>
							</div>
							<span class="status-dot {statusDotClass(u.id)}"></span>
{#if canManageRoles}
							<div class="role-select">
								<select
									class="user-role-select"
									aria-label={`Atribuir Role a ${u.nickname || u.username}`}
									disabled={busyUsers.has(u.id)}
									onchange={(e) => {
										const sel = e.target as HTMLSelectElement;
										const val = sel.value;
										sel.selectedIndex = 0;
										if (val) assignRole(u.id, val);
									}}
								>
									<option class="admin-option" value="">Atribuir Role…</option>
									{#each roles as r (r.id)}
										<option class="admin-option" value={r.id}>{r.name}</option>
									{/each}
								</select>
							</div>
							{/if}
							<div class="role-chips">
								{#each u.roles as r (r.id)}
									<span class="chip" style="color:{r.color}">
										{r.name}
{#if canManageRoles}
										<button
											class="chip-x"
											aria-label={`Remover Role ${r.name}`}
											disabled={busyUsers.has(u.id)}
											onclick={() => void removeRole(u.id, r.id)}
										>
											×
										</button>
										{/if}
									</span>
								{/each}
							</div>

{#if canManageServer}
							<button
								class="admin-btn ghost small"
								class:unban={isBanned(u.id)}
								aria-label={isBanned(u.id)
									? `Desbanir ${u.nickname || u.username}`
									: `Banir ${u.nickname || u.username}`}
								disabled={busyUsers.has(u.id)}
								onclick={() => void toggleBan(u)}
							>
								<Icon name={isBanned(u.id) ? 'arrow-counter-clockwise' : 'x-circle'} variant="light" size={14} />
								{isBanned(u.id) ? 'Desbanir' : 'Banir'}
							</button>
							{/if}
						</div>
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
	.users-head-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.users-head-actions .filter-input {
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
		scrollbar-color: rgba(72, 130, 170, 0.28) transparent;
	}
	.users-list::-webkit-scrollbar {
		width: 10px;
	}
	.users-list::-webkit-scrollbar-thumb {
		background: rgba(72, 130, 170, 0.22);
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
	:global([data-theme='dark']) .user-row:hover {
		background: rgba(119, 194, 235, 0.085);
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
	:global([data-theme='dark']) .user-role-select {
		border-color: rgba(185, 224, 250, 0.14);
		background: rgba(25, 51, 68, 0.6);
	}
	.role-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		position: relative;
	}
	.chip:has(.chip-x) {
		padding-right: 20px;
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
	.user-feedback {
		margin-bottom: 10px;
		padding: 8px 12px;
		border-radius: 10px;
		font-size: 12px;
	}
	.user-feedback.success {
		background: rgba(36, 201, 130, 0.1);
		color: #199966;
	}
	.user-feedback.error {
		background: rgba(220, 40, 40, 0.1);
		color: #c43a46;
	}

	.banned-row {
		opacity: 0.76;
		background: rgba(240, 61, 94, 0.055);
	}
	.admin-btn.unban {
		color: #24a86f;
		border-color: rgba(36, 168, 111, 0.25);
	}
	:global([data-theme='dark']) .banned-row {
		background: rgba(240, 61, 94, 0.07);
	}
	.loading-hint {
		text-align: center;
		padding: 24px;
		font-size: 13px;
		color: var(--muted);
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

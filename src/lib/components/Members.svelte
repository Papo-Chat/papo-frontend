<script lang="ts">
	import { state as uiState } from '$lib/store/ui.svelte';
	import { state as sessionState, setStatus } from '$lib/store/session.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import type { UserSummary } from '$lib/types';
	import MemberRow from './MemberRow.svelte';
	import MobilePanelHead from './MobilePanelHead.svelte';

	let searchQuery = $state('');
	let statusSaving = $state(false);
	let statusError: string | null = $state(null);
	const drawerOpen = $derived(uiState.membersDrawerOpen);
	const myStatus = $derived(sessionState.status ?? 'online');
	async function changeStatus(status: 'online' | 'away' | 'busy'): Promise<void> {
		if (statusSaving || status === myStatus) return;
		statusSaving = true; statusError = null;
		try { await setStatus(status === 'online' ? null : status); }
		catch (err) { statusError = err instanceof Error ? err.message : 'Falha ao alterar status.'; }
		finally { statusSaving = false; }
	}

	// Directory window (max 300) + online users hydrated by presence_sync.
	const users = $derived.by(() => {
		const map = new Map<string, UserSummary>();
		for (const user of usersStore.state.list.items) {
			if (!user.banned && !usersStore.state.bannedIds.has(user.id)) map.set(user.id, user);
		}
		for (const id of usersStore.state.presence.keys()) {
			const user = usersStore.state.byId.get(id);
			if (user && !user.banned && !usersStore.state.bannedIds.has(user.id)) {
				map.set(user.id, user);
			}
		}
		return [...map.values()];
	});

	let membersEl: HTMLElement | null = null;

	$effect(() => {
		if (usersStore.state.list.items.length === 0 && !usersStore.state.list.loading) {
			void usersStore.loadList();
		}
	});

	function onMembersScroll(e: Event): void {
		const sc = e.currentTarget as HTMLElement;
		const bottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
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


	function computeSections(): Array<{ title: string; members: UserSummary[] }> {
		const get = (u: UserSummary) => usersStore.effectiveStatus(u.id);
		const groups: Array<{ title: string; members: UserSummary[] }> = [];
		const online = users.filter((u) => get(u) === 'online');
		const offline = users.filter((u) => get(u) === 'offline');
		const away = users.filter((u) => get(u) === 'away');
		const busy = users.filter((u) => get(u) === 'busy');
		if (online.length) groups.push({ title: `ONLINE — ${online.length}`, members: online });
		if (away.length) groups.push({ title: `AUSENTE — ${away.length}`, members: away });
		if (busy.length) groups.push({ title: `OCUPADO — ${busy.length}`, members: busy });
		if (offline.length) groups.push({ title: `OFFLINE — ${offline.length}`, members: offline });
		return groups;
	}
	const sections = $derived(computeSections());

	function computeMatches(): UserSummary[] | null {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return null;
		return users.filter((u) => (u.nickname || u.username).toLowerCase().includes(q));
	}
	const matches = $derived(computeMatches());

	function closeDrawer(): void {
		uiState.membersDrawerOpen = false;
	}
</script>

<aside
	class="members {drawerOpen ? 'open' : ''}"
	bind:this={membersEl}
	onscroll={onMembersScroll}
>
	<MobilePanelHead icon="users-three" title="Membros" onClose={closeDrawer} />
	<div class="status-picker" aria-label="Status">
		<div class="status-picker-head">
			<span class="status-picker-title">Status</span>
			<span class="status-current">
				<span class="status-dot {myStatus}"></span>
				{myStatus === 'away' ? 'Ausente' : myStatus === 'busy' ? 'Ocupado' : 'Online'}
			</span>
		</div>
		<div class="status-actions" role="group" aria-label="Alterar status">
			<button class:active={myStatus === 'online'} disabled={statusSaving} onclick={() => changeStatus('online')}>
				<span class="status-dot online"></span>
				<span>Online</span>
			</button>
			<button class:active={myStatus === 'away'} disabled={statusSaving} onclick={() => changeStatus('away')}>
				<span class="status-dot away"></span>
				<span>Ausente</span>
			</button>
			<button class:active={myStatus === 'busy'} disabled={statusSaving} onclick={() => changeStatus('busy')}>
				<span class="status-dot busy"></span>
				<span>Ocupado</span>
			</button>
		</div>
		{#if statusError}<small class="status-error">{statusError}</small>{/if}
	</div>

	<div class="search">
		<i class="ph-light ph-magnifying-glass" aria-hidden="true"></i>
		<input
			type="text"
			placeholder="Procurar membros…"
			bind:value={searchQuery}
			aria-label="Procurar membros"
		/>
	</div>

	{#if matches}
		{#each matches as u (u.id)}
			<MemberRow user={u} />
		{/each}
	{:else}
		{#each sections as section}
			<div class="member-section">{section.title}</div>
			{#each section.members as u (u.id)}
				<MemberRow user={u} />
			{/each}
		{/each}
	{/if}
</aside>

<style>
	.status-picker {
		top: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0 0 12px;
		padding: 16px 4px; /* Aumenta o espaço interno, deixando a caixa mais "gorda" e preenchendo o topo */
		border-radius: 15px;
		background:
		radial-gradient(circle at 12% -28%, rgba(255, 255, 255, 0.7), transparent 44%),
		linear-gradient(145deg, rgba(246, 252, 255, 0.72), rgba(215, 238, 250, 0.55));
		border: 1px solid rgba(255, 255, 255, 0.68);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.9),
			0 7px 18px rgba(22, 77, 112, 0.08);
		backdrop-filter: blur(12px) saturate(120%);
		-webkit-backdrop-filter: blur(12px) saturate(120%);

		width: 100%;
		margin-bottom: 16px; /* Empurra a barra de pesquisa um pouco mais para baixo */
		box-sizing: border-box;
	}

	.status-picker-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.status-picker-title {
		color: var(--muted);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.status-current {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--muted-soft);
		font-size: 10px;
		font-weight: 700;
	}

	.status-actions {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 2px;
	}

	.status-actions button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
		height: 31px;
		padding: 0 6px;
		border: 1px solid rgba(115, 170, 205, 0.16);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.38);
		color: var(--muted-soft);
		font: inherit;
		font-size: 10px;
		font-weight: 650;
		cursor: pointer;
		transition:
			transform 0.16s var(--ease),
			background 0.16s ease,
			border-color 0.16s ease;
	}

	.status-actions button:hover:not(:disabled) {
		transform: translateY(-1px);
		background: rgba(255, 255, 255, 0.62);
		border-color: rgba(100, 174, 219, 0.28);
	}

	.status-actions button.active {
		border-color: rgba(67, 156, 214, 0.34);
		background: linear-gradient(180deg, rgba(198, 235, 255, 0.78), rgba(139, 207, 244, 0.42));
		color: var(--text-primary);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
	}

	.status-actions button:disabled {
		opacity: 0.62;
		cursor: wait;
	}

	.status-dot {
		width: 7px;
		height: 7px;
		flex: 0 0 7px;
		border-radius: 50%;
	}

	.status-dot.online {
		background: #24c982;
		box-shadow: 0 0 0 2px rgba(36, 201, 130, 0.12);
	}

	.status-dot.away {
		background: #e7a80b;
		box-shadow: 0 0 0 2px rgba(231, 168, 11, 0.12);
	}

	.status-dot.busy {
		background: #f03d5e;
		box-shadow: 0 0 0 2px rgba(240, 61, 94, 0.12);
	}

	.status-error {
		color: var(--danger);
		font-size: 10px;
		font-weight: 600;
	}

	:global(html[data-theme='dark']) .status-picker {
		border-color: rgba(181, 222, 248, 0.12);
		background:
			radial-gradient(circle at 14% -28%, rgba(113, 204, 255, 0.1), transparent 44%),
			linear-gradient(145deg, rgba(39, 68, 86, 0.68), rgba(14, 39, 54, 0.58));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.08),
			0 7px 18px rgba(0, 0, 0, 0.2);
	}

	:global(html[data-theme='dark']) .status-actions button {
		border-color: rgba(177, 219, 244, 0.1);
		background: rgba(87, 126, 149, 0.16);
	}

	:global(html[data-theme='dark']) .status-actions button:hover:not(:disabled) {
		background: rgba(95, 165, 204, 0.18);
		border-color: rgba(138, 207, 245, 0.16);
	}

	:global(html[data-theme='dark']) .status-actions button.active {
		border-color: rgba(104, 195, 242, 0.24);
		background: linear-gradient(180deg, rgba(62, 143, 189, 0.3), rgba(25, 88, 123, 0.26));
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
	}

	:global(html[data-ui-flat]) .status-picker {
		background: linear-gradient(145deg, #f5fbfe, #dfedf5);
		box-shadow: 0 5px 14px rgba(20, 73, 106, 0.08);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	:global(html[data-ui-flat]) .status-actions button {
		background: #eef7fb;
	}

	:global(html[data-ui-flat][data-theme='dark']) .status-picker {
		background: linear-gradient(145deg, #203f52, #102f42);
		box-shadow: 0 5px 14px rgba(0, 0, 0, 0.18);
	}

	:global(html[data-ui-flat][data-theme='dark']) .status-actions button {
		background: #24495f;
	}

	:global(html[data-ui-mobile]) .status-actions button:hover:not(:disabled) {
		transform: none;
	}
</style>

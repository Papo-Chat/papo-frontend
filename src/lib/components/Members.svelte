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
	let statusMenuOpen = $state(false);
	let statusMenuEl: HTMLElement | null = $state(null);
	const drawerOpen = $derived(uiState.membersDrawerOpen);
	const myStatus = $derived(sessionState.status ?? 'online');
	const myStatusLabel = $derived(myStatus === 'away' ? 'Ausente' : myStatus === 'busy' ? 'Ocupado' : 'Online');
	async function changeStatus(status: 'online' | 'away' | 'busy'): Promise<void> {
		if (statusSaving || status === myStatus) {
			statusMenuOpen = false;
			return;
		}
		statusSaving = true;
		statusError = null;
		try {
			await setStatus(status === 'online' ? null : status);
			statusMenuOpen = false;
		} catch (err) {
			statusError = err instanceof Error ? err.message : 'Falha ao alterar status.';
		} finally {
			statusSaving = false;
		}
	}

	$effect(() => {
		if (!statusMenuOpen) return;
		function onPointerDown(e: PointerEvent): void {
			if (statusMenuEl && !statusMenuEl.contains(e.target as Node)) statusMenuOpen = false;
		}
		function onKeyDown(e: KeyboardEvent): void {
			if (e.key === 'Escape') statusMenuOpen = false;
		}
		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	});

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
	<div class="status-picker" aria-label="Status" bind:this={statusMenuEl}>
		<span class="status-picker-title">Seu status</span>
		<button
			type="button"
			class="status-trigger"
			class:open={statusMenuOpen}
			disabled={statusSaving}
			onclick={() => (statusMenuOpen = !statusMenuOpen)}
			aria-haspopup="menu"
			aria-expanded={statusMenuOpen}
		>
			<span class="status-trigger-main">
				<span class="status-dot {myStatus}"></span>
				<span>{statusSaving ? 'Atualizando…' : myStatusLabel}</span>
			</span>
			<i class="ph-light ph-caret-down status-caret" aria-hidden="true"></i>
		</button>

		{#if statusMenuOpen}
			<div class="status-menu" role="menu" aria-label="Alterar status">
				<button class:active={myStatus === 'online'} role="menuitemradio" aria-checked={myStatus === 'online'} onclick={() => changeStatus('online')}>
					<span class="status-dot online"></span>
					<span class="status-option-copy"><strong>Online</strong><small>Disponível para conversar</small></span>
					{#if myStatus === 'online'}<i class="ph-light ph-check"></i>{/if}
				</button>
				<button class:active={myStatus === 'away'} role="menuitemradio" aria-checked={myStatus === 'away'} onclick={() => changeStatus('away')}>
					<span class="status-dot away"></span>
					<span class="status-option-copy"><strong>Ausente</strong><small>Sem atividade no momento</small></span>
					{#if myStatus === 'away'}<i class="ph-light ph-check"></i>{/if}
				</button>
				<button class:active={myStatus === 'busy'} role="menuitemradio" aria-checked={myStatus === 'busy'} onclick={() => changeStatus('busy')}>
					<span class="status-dot busy"></span>
					<span class="status-option-copy"><strong>Ocupado</strong><small>Evitar interrupções</small></span>
					{#if myStatus === 'busy'}<i class="ph-light ph-check"></i>{/if}
				</button>
			</div>
		{/if}
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
		position: relative;
		display: grid;
		gap: 6px;
		margin: 0 0 14px;
		padding: 0 2px;
	}
	.status-picker-title {
		padding-left: 7px;
		color: var(--muted);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.status-trigger {
		width: 100%;
		height: 42px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 0 11px;
		border: 1px solid rgba(255, 255, 255, 0.62);
		border-radius: 12px;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.68), rgba(215, 238, 250, 0.5));
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86), 0 6px 14px rgba(22, 77, 112, 0.07);
		color: var(--text-primary);
		font: inherit;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		backdrop-filter: blur(12px) saturate(120%);
		-webkit-backdrop-filter: blur(12px) saturate(120%);
		transition: 0.16s var(--ease);
	}
	.status-trigger:hover:not(:disabled), .status-trigger.open {
		transform: translateY(-1px);
		border-color: rgba(100, 174, 219, 0.3);
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(198, 232, 250, 0.64));
	}
	.status-trigger:disabled { opacity: 0.7; cursor: wait; }
	.status-trigger-main { display: inline-flex; align-items: center; gap: 8px; }
	.status-caret { font-size: 13px; color: var(--muted-soft); transition: transform 0.16s var(--ease); }
	.status-trigger.open .status-caret { transform: rotate(180deg); }
	.status-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 2px;
		right: 2px;
		z-index: 80;
		display: grid;
		gap: 3px;
		padding: 5px;
		border: 1px solid rgba(255, 255, 255, 0.7);
		border-radius: 13px;
		background: radial-gradient(circle at 12% -20%, rgba(255, 255, 255, 0.65), transparent 44%), linear-gradient(145deg, rgba(246, 252, 255, 0.92), rgba(211, 236, 249, 0.88));
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 14px 30px rgba(20, 67, 100, 0.18);
		backdrop-filter: blur(18px) saturate(130%);
		-webkit-backdrop-filter: blur(18px) saturate(130%);
	}
	.status-menu button {
		display: grid;
		grid-template-columns: 8px minmax(0, 1fr) 14px;
		align-items: center;
		gap: 9px;
		min-height: 45px;
		padding: 6px 9px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: background 0.14s ease, transform 0.14s var(--ease);
	}
	.status-menu button:hover, .status-menu button.active { background: rgba(255, 255, 255, 0.52); }
	.status-menu button:hover { transform: translateX(1px); }
	.status-option-copy { display: flex; min-width: 0; flex-direction: column; gap: 1px; }
	.status-option-copy strong { font-size: 11px; font-weight: 750; }
	.status-option-copy small { color: var(--muted-soft); font-size: 9px; font-weight: 500; }
	.status-menu .ph-check { font-size: 13px; color: var(--link); }
	.status-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; }
	.status-dot.online { background: #24c982; box-shadow: 0 0 0 2px rgba(36, 201, 130, 0.12); }
	.status-dot.away { background: #e7a80b; box-shadow: 0 0 0 2px rgba(231, 168, 11, 0.12); }
	.status-dot.busy { background: #f03d5e; box-shadow: 0 0 0 2px rgba(240, 61, 94, 0.12); }
	.status-error { padding-left: 7px; color: var(--danger); font-size: 10px; font-weight: 600; }
	:global(html[data-theme='dark']) .status-trigger {
		border-color: rgba(181, 222, 248, 0.12);
		background: linear-gradient(180deg, rgba(62, 92, 111, 0.34), rgba(22, 50, 66, 0.3));
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 6px 14px rgba(0, 0, 0, 0.16);
	}
	:global(html[data-theme='dark']) .status-trigger:hover:not(:disabled),
	:global(html[data-theme='dark']) .status-trigger.open {
		background: linear-gradient(180deg, rgba(72, 119, 145, 0.34), rgba(27, 65, 86, 0.32));
	}
	:global(html[data-theme='dark']) .status-menu {
		border-color: rgba(181, 222, 248, 0.12);
		background: radial-gradient(circle at 14% -20%, rgba(113, 204, 255, 0.1), transparent 44%), linear-gradient(145deg, rgba(39, 68, 86, 0.94), rgba(14, 39, 54, 0.92));
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 14px 30px rgba(0, 0, 0, 0.28);
	}
	:global(html[data-theme='dark']) .status-menu button:hover,
	:global(html[data-theme='dark']) .status-menu button.active { background: rgba(95, 165, 204, 0.14); }
	:global(html[data-ui-flat]) .status-trigger { backdrop-filter: none; -webkit-backdrop-filter: none; }
	:global(html[data-ui-flat]) .status-menu { backdrop-filter: none; -webkit-backdrop-filter: none; }
	:global(html[data-ui-mobile]) .status-menu button:hover { transform: none; }

</style>

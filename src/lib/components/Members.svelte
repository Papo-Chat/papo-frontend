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

	// Usuários reais: summaries do servidor + presença viva (WS) sobrepondo
	// o status persistido.
	const users = $derived([...usersStore.state.byId.values()]);


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

<aside class="members {drawerOpen ? 'open' : ''}">
	<MobilePanelHead icon="users-three" title="Membros" onClose={closeDrawer} />
	<div class="status-picker" aria-label="Seu status">
		<span>Seu status</span>
		<div class="status-actions">
			<button class:active={myStatus === 'online'} disabled={statusSaving} onclick={() => changeStatus('online')}>Online</button>
			<button class:active={myStatus === 'away'} disabled={statusSaving} onclick={() => changeStatus('away')}>Ausente</button>
			<button class:active={myStatus === 'busy'} disabled={statusSaving} onclick={() => changeStatus('busy')}>Ocupado</button>
		</div>
		{#if statusError}<small>{statusError}</small>{/if}
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
.status-picker{display:flex;flex-direction:column;gap:6px;padding:8px 10px 4px;color:var(--muted-soft);font-size:11px;font-weight:700}.status-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.status-actions button{padding:6px 4px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--muted-soft);font:inherit;cursor:pointer}.status-actions button.active{background:var(--hover);color:var(--text-primary)}.status-picker small{color:var(--danger)}
</style>

<script lang="ts">
	import { state as uiState } from '$lib/store/ui.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import type { UserSummary } from '$lib/types';
	import MemberRow from './MemberRow.svelte';
	import MobilePanelHead from './MobilePanelHead.svelte';

	let searchQuery = $state('');
	const drawerOpen = $derived(uiState.membersDrawerOpen);

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

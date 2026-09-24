<script lang="ts">
	import { state as uiState } from '$lib/store/ui.svelte';
	import { sampleUsers } from '$lib/sample';
	import type { UserSummary } from '$lib/types';
	import MemberRow from './MemberRow.svelte';
	import MobilePanelHead from './MobilePanelHead.svelte';

	let searchQuery = $state('');
	const drawerOpen = $derived(uiState.membersDrawerOpen);

	function computeSections(): Array<{ title: string; members: UserSummary[] }> {
		const groups: Array<{ title: string; members: UserSummary[] }> = [];
		const online = sampleUsers.filter((u) => u.status === null);
		const away = sampleUsers.filter((u) => u.status === 'away');
		const busy = sampleUsers.filter((u) => u.status === 'busy');
		if (online.length) groups.push({ title: `ONLINE — ${online.length}`, members: online });
		if (away.length) groups.push({ title: `AUSENTE — ${away.length}`, members: away });
		if (busy.length) groups.push({ title: `JOGANDO — ${busy.length}`, members: busy });
		return groups;
	}
	const sections = $derived(computeSections());

	function computeMatches(): UserSummary[] | null {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return null;
		return sampleUsers.filter((u) => (u.nickname || u.username).toLowerCase().includes(q));
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

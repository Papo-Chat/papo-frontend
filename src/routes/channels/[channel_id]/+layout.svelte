<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { state, closeProfile } from '$lib/store/ui.svelte';
	import * as channelsStore from '$lib/store/channels.svelte';
	import Rail from '$lib/components/Rail.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Members from '$lib/components/Members.svelte';
	import ProfileCard from '$lib/components/ProfileCard.svelte';

	// Resolve the channel once so sidebar active state and the page both
	// agree on the canonical channel id (id or name in the URL). O guard
	// (`+layout.ts`) garante um canal resolvido ou redireciona — logo não null.
	const channel = $derived(channelsStore.resolve(page.params.channel_id)!);

	function selectChannel(id: string): void {
		if (id !== channel.id) goto(`/channels/${id}`);
	}

	// Profile card (4.1): opened by clicking a user in the members drawer
	// or in the chat.
	const profileUser = $derived(state.profileOpen ? state.profileUser : null);
</script>

<div class="app-shell">
	{#if state.channelsDrawerOpen}
		<button
			class="mobile-overlay"
			aria-hidden="true"
			onclick={() => (state.channelsDrawerOpen = false)}
		></button>
	{/if}
	{#if state.membersDrawerOpen}
		<button
			class="mobile-overlay"
			aria-hidden="true"
			onclick={() => (state.membersDrawerOpen = false)}
		></button>
	{/if}

	<Rail />

	<Sidebar openChannelId={channel.id} onSelectChannel={selectChannel} />

	<main class="main">
		<slot />
	</main>

	<Members />

	{#if profileUser}
		<ProfileCard
			user={profileUser}
			bind:open={state.profileOpen}
			onOpenChange={(o) => {
				if (!o) closeProfile();
			}}
		/>
	{/if}
</div>

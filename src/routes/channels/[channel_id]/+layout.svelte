<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { state, closeProfile } from '$lib/store/ui.svelte';
	import { sampleUsers, resolveChannel } from '$lib/sample';
	import Rail from '$lib/components/Rail.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Members from '$lib/components/Members.svelte';
	import ProfileCard from '$lib/components/ProfileCard.svelte';
	import type { UserProfile, UserSummary } from '$lib/types';

	// Resolve the channel once so sidebar active state and the page both
	// agree on the canonical channel id (id or name in the URL).
	const channel = $derived(resolveChannel(page.params.channel_id));

	function selectChannel(id: string): void {
		if (id !== channel.id) goto(`/channels/${id}`);
	}

	// Profile card (4.1): opened by clicking a user in the members drawer
	// or in the chat.
	const profileUser = $derived(state.profileOpen ? state.profileUser : null);
	const profileProfile: UserProfile | null = $derived(
		profileUser ? toProfile(profileUser) : toProfile(sampleUsers[0])
	);

	function toProfile(u: UserSummary): UserProfile {
		return {
			...u,
			avatar_blob: null,
			avatar_format: '',
			banner_media: null,
			description: u.status_message ?? null
		};
	}
</script>

<div class="app-shell">
	{#if state.channelsDrawerOpen}
		<button
			class="mobile-overlay"
			aria-hidden="true"
			on:click={() => state.channelsDrawerOpen = false}
		></button>
	{/if}
	{#if state.membersDrawerOpen}
		<button
			class="mobile-overlay"
			aria-hidden="true"
			on:click={() => state.membersDrawerOpen = false}
		></button>
	{/if}

	<Rail />

	<Sidebar
		openChannelId={channel.id}
		onSelectChannel={selectChannel}
	/>

	<main class="main">
		<slot />
	</main>

	<Members />

	<ProfileCard
		user={profileProfile}
		bind:open={state.profileOpen}
		onOpenChange={(o) => { if (!o) closeProfile(); }}
	/>
</div>

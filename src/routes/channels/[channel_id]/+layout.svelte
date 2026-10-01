<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { state, closeProfile } from '$lib/store/ui.svelte';
	import * as channelsStore from '$lib/store/channels.svelte';
	import Rail from '$lib/components/Rail.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import Members from '$lib/components/Members.svelte';
	import MemberDirectory from '$lib/components/MemberDirectory.svelte';
	import ProfileCard from '$lib/components/ProfileCard.svelte';

	const channel = $derived(channelsStore.resolve(page.params.channel_id)!);

	function selectChannel(id: string): void {
		if (id !== channel.id) goto(`/channels/${id}`);
	}

	const profileUser = $derived(state.profileOpen ? state.profileUser : null);
</script>

<div class="app-shell">
	{#if state.channelsDrawerOpen}
		<button
			class="mobile-overlay channels-overlay"
			aria-hidden="true"
			onclick={() => (state.channelsDrawerOpen = false)}
		></button>
	{/if}

	{#if state.membersDrawerOpen}
		<button
			class="mobile-overlay members-overlay"
			aria-hidden="true"
			onclick={() => (state.membersDrawerOpen = false)}
		></button>
	{/if}

	{#if state.railDrawerOpen}
		<button
			class="rail-overlay"
			aria-label="Fechar navegação"
			onclick={() => (state.railDrawerOpen = false)}
		></button>
	{/if}

	{#if state.dmDirectoryOpen}
		<button
			class="directory-overlay"
			aria-label="Fechar lista de membros para DM"
			onclick={() => (state.dmDirectoryOpen = false)}
		></button>
	{/if}

	<Rail />

	<Sidebar openChannelId={channel.id} onSelectChannel={selectChannel} />

	<main class="main">
		<slot />
	</main>

	<Members />

	{#if state.dmDirectoryOpen}
		<MemberDirectory />
	{/if}

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

<style>
	.directory-overlay,
	.rail-overlay {
		position: absolute;
		inset: 0;
		border: 0;
		padding: 0;
		cursor: default;
		background: rgba(4, 18, 31, 0.14);
	}

	.directory-overlay {
		z-index: 130;
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(5px);
	}

	.rail-overlay {
		display: none;
		z-index: 170;
	}

	:global([data-theme='dark']) .directory-overlay,
	:global([data-theme='dark']) .rail-overlay {
		background: rgba(0, 7, 13, 0.34);
	}

	:global(html[data-ui-flat]) .directory-overlay,
	:global(html[data-ui-flat]) .rail-overlay {
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		background: rgba(4, 18, 31, 0.34);
	}

	@media (max-width: 700px) {
		.rail-overlay {
			display: block;
		}
	}
</style>

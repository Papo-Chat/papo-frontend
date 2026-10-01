<script lang="ts">
	import { state, closeProfile } from '$lib/store/ui.svelte';
	import Rail from '$lib/components/Rail.svelte';
	import MemberDirectory from '$lib/components/MemberDirectory.svelte';
	import ProfileCard from '$lib/components/ProfileCard.svelte';

	const profileUser = $derived(state.profileOpen ? state.profileUser : null);
</script>

<div class="app-shell dm-shell">
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
			aria-label="Fechar membros"
			onclick={() => (state.dmDirectoryOpen = false)}
		></button>
	{/if}

	<Rail />

	<main class="main">
		<slot />
	</main>

	{#if state.dmDirectoryOpen}
		<MemberDirectory />
	{/if}

	{#if profileUser}
		<ProfileCard
			user={profileUser}
			bind:open={state.profileOpen}
			onOpenChange={(open) => {
				if (!open) closeProfile();
			}}
		/>
	{/if}
</div>

<style>
	:global(.app-shell.dm-shell) {
		grid-template-columns: 78px minmax(0, 1fr);
	}

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

	@media (max-width: 1220px) {
		:global(.app-shell.dm-shell) {
			grid-template-columns: 74px minmax(0, 1fr);
		}
	}

	@media (max-width: 940px) {
		:global(.app-shell.dm-shell) {
			grid-template-columns: 70px minmax(0, 1fr);
		}
	}

	@media (max-width: 700px) {
		:global(.app-shell.dm-shell) {
			grid-template-columns: minmax(0, 1fr);
		}
		.rail-overlay {
			display: block;
		}
	}
</style>

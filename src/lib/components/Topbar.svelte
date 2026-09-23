<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Channel } from '$lib/types';
	import { state } from '$lib/store/ui.svelte';
	import Icon from './Icon.svelte';
	import NotificationsPopover from './NotificationsPopover.svelte';
	import PinsPopover from './PinsPopover.svelte';
	import SearchMessagePopover from './SearchMessagePopover.svelte';

	let {
		channel,
		searchQuery = $bindable(''),
		searchOpen = $bindable(false),
		onSearchQueryChange,
		onSearchOpenChange
	} = $props<{
		channel: Channel;
		searchQuery?: string;
		searchOpen?: boolean;
		onSearchQueryChange?: (q: string) => void;
		onSearchOpenChange?: (open: boolean) => void;
	}>();

	function openSidebar(): void {
		state.channelsDrawerOpen = true;
	}

	function openMembers(): void {
		state.membersDrawerOpen = true;
	}

	function openNotifications(): void {
		state.notificationsPopoverOpen = true;
	}

	function openPins(): void {
		state.pinsPopoverOpen = true;
	}

	function toggleSearch(): void {
		onSearchOpenChange?.(!searchOpen);
	}
</script>

<header class="topbar">
	<button
		class="chat-icon"
		on:click={openSidebar}
		aria-label="Abrir canais"
		title="Abrir canais"
	>
		<Icon name="list" variant="light" />
	</button>

	<div class="title-wrap">
		<div class="title-row">
			<h2>{channel.name}</h2>
			<button
				class="pill channel-admin-btn"
				on:click={() => goto(`/channels/${channel.id}/admin`)}
				aria-label="Administração do canal"
				title="Administração do canal"
			>
				<Icon name="gear" variant="light" />
			</button>
		</div>
		{#if channel.topic}
			<p>{channel.topic}</p>
		{/if}
	</div>

	<div class="actions">
		<button
			class="pill circle header-icon-btn members-btn"
			on:click={openMembers}
			aria-label="Abrir membros"
			title="Abrir membros"
		>
			<Icon name="users-three" variant="light" />
		</button>
		{#if onSearchOpenChange}
			<button
				class="pill circle header-icon-btn"
				on:click={toggleSearch}
				aria-label="Pesquisar mensagens"
				title="Pesquisar mensagens"
			>
				<Icon name="magnifying-glass" variant="light" />
			</button>
		{/if}
		<button
			class="pill circle header-icon-btn"
			on:click={openNotifications}
			aria-label="Notificações"
			title="Notificações"
		>
			<Icon name="bell" variant="light" />
		</button>
		<button
			class="pill circle header-icon-btn"
			on:click={openPins}
			aria-label="Mensagens fixadas"
			title="Mensagens fixadas"
		>
			<Icon name="push-pin" variant="light" />
		</button>
	</div>

	<NotificationsPopover />
	<PinsPopover />
	{#if onSearchOpenChange}
		<SearchMessagePopover
			searchQuery={searchQuery}
			open={searchOpen}
			onOpenChange={onSearchOpenChange}
		/>
	{/if}
</header>

<style>
	button.chat-icon{
		font: inherit;
		-webkit-appearance: none;
		appearance: none;
	}
	button.pill{
		font: inherit;
		-webkit-appearance: none;
		appearance: none;
	}
</style>

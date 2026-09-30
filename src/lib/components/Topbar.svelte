<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Channel, SearchResult } from '$lib/types';
	import { state } from '$lib/store/ui.svelte';
	import * as notificationsStore from '$lib/store/notifications.svelte';
	import { meId, state as sessionState } from '$lib/store/session.svelte';
	import { state as serverState } from '$lib/store/server.svelte';
	import * as rolesStore from '$lib/store/roles.svelte';
	import { can } from '$lib/store/roles.svelte';
	import Icon from './Icon.svelte';
	import NotificationsPopover from './NotificationsPopover.svelte';
	import PinsPopover from './PinsPopover.svelte';
	import SearchMessagePopover from './SearchMessagePopover.svelte';

	let {
		channel,
		searchQuery = $bindable(''),
		searchOpen = $bindable(false),
		onSearchQueryChange,
		onSearchOpenChange,
		onSearchResult
	} = $props<{
		channel: Channel;
		searchQuery?: string;
		searchOpen?: boolean;
		onSearchQueryChange?: (q: string) => void;
		onSearchOpenChange?: (open: boolean) => void;
		onSearchResult?: (result: SearchResult) => void;
	}>();

	// Botão de administração: só visível para dono do servidor ou roles
	// com `manage_channels` — espelha o backend (RequireManageChannels
	// sobre PUT/DELETE /channels/:channel_id).
	const me = $derived(meId());
	const isOwner = $derived(!!me && serverState.server?.owner_id === me);
	const myRoleIds = $derived(new Set(sessionState.roles.map((r) => r.id)));
	const myRoles = $derived(rolesStore.state.list.filter((r) => myRoleIds.has(r.id)));
	const ctx = $derived({ roles: myRoles, isOwner });
	const canManageChannel = $derived(can('manage_channels', ctx));

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
	<button class="chat-icon" on:click={openSidebar} aria-label="Abrir canais" title="Abrir canais">
		<Icon name="list" variant="light" />
	</button>

	<div class="title-wrap">
		<div class="title-row">
			<h2>{channel.name}</h2>
			{#if canManageChannel}
				<button
					class="pill channel-admin-btn"
					on:click={() => goto(`/channels/${channel.id}/admin`)}
					aria-label="Administração do canal"
					title="Administração do canal"
				>
					<Icon name="gear" variant="light" />
				</button>
			{/if}
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
			style="position: relative"
			on:click={openNotifications}
			aria-label="Notificações"
			title="Notificações"
		>
			<Icon name="bell" variant="light" />
			{#if notificationsStore.state.unreadCount > 0}
				<span class="unread-badge">{notificationsStore.state.unreadCount}</span>
			{/if}
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
			{searchQuery}
			open={searchOpen}
			onOpenChange={onSearchOpenChange}
			onResultClick={onSearchResult}
		/>
	{/if}
</header>

<style>
	button.chat-icon {
		font: inherit;
		-webkit-appearance: none;
		appearance: none;
	}

	button.pill {
		font: inherit;
		-webkit-appearance: none;
		appearance: none;
	}
</style>

<script lang="ts">
	import type { Channel } from '$lib/types';
	import { state } from '$lib/store/ui.svelte';
	import Icon from './Icon.svelte';
	import ThemeSwitch from './ThemeSwitch.svelte';
	import NotificationsPopover from './NotificationsPopover.svelte';
	import PinsPopover from './PinsPopover.svelte';

	let { channel } = $props<{ channel: Channel }>();

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
		<h2>{channel.name}</h2>
		{#if channel.topic}
			<p>{channel.topic}</p>
		{/if}
	</div>

	<div class="actions">
		<button
			class="pill circle header-icon-btn"
			on:click={openMembers}
			aria-label="Abrir membros"
			title="Abrir membros"
		>
			<Icon name="users-three" variant="light" />
		</button>
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

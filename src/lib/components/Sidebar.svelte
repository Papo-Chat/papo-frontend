<script lang="ts">
	import { goto } from '$app/navigation';
	import { state } from '$lib/store/ui.svelte';
	import * as channelsStore from '$lib/store/channels.svelte';
	import { state as serverState } from '$lib/store/server.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import Icon from './Icon.svelte';
	import ServerIcon from './ServerIcon.svelte';
	import ChannelItem from './ChannelItem.svelte';
	import MobilePanelHead from './MobilePanelHead.svelte';

	let { openChannelId = null, onSelectChannel } = $props<{
		openChannelId?: string | null;
		onSelectChannel?: (id: string) => void;
	}>();

	const server = $derived(serverState.server);
	const groups = $derived(channelsStore.grouped());

	const onlineCount = $derived(
		[...usersStore.state.byId.values()].filter((u) => usersStore.effectiveStatus(u.id) === 'online')
			.length
	);
	const drawerOpen = $derived(state.channelsDrawerOpen);

	function closeDrawer(): void {
		state.channelsDrawerOpen = false;
	}

	function selectChannel(id: string): void {
		onSelectChannel(id);
	}

	function goHome(): void {
		const home = channelsStore.homeChannel();
		if (home) goto(`/channels/${home.id}`);
	}

	// Atalhos: only route-related shortcuts are kept (channels are sample
	// data, so the mockup channel/mockup buttons were dropped).
	const shortcuts = [
		{
			to: '/admin/server',
			icon: 'shield-check',
			variant: 'light' as const,
			label: 'Administração'
		},
		{ to: '/user/settings', icon: 'gear', variant: 'light' as const, label: 'Ajustes' }
	];

	function navigateShortcut(to: string): void {
		state.channelsDrawerOpen = false;
		goto(to);
	}
</script>

<aside class="sidebar {drawerOpen ? 'open' : ''}">
	<MobilePanelHead icon="hash" title="Canais" onClose={closeDrawer} />

	<div class="community">
		<div class="community-logo" aria-hidden="true">
			<ServerIcon
				iconBlob={server?.icon_blob ?? null}
				iconFormat={server?.icon_format ?? ''}
				name={server?.name ?? ''}
				size={54}
			/>
		</div>
		<div>
			<h1>{server?.name}</h1>
			<p>Comunidade de amigos</p>
			<p style="margin-top:7px">
				<span class="online-dot"></span>{onlineCount} Online
			</p>
		</div>
	</div>

	<button class="home-link" aria-label="Início" onclick={goHome}>
		<span class="icon">
			<Icon name="house" variant="light" />
		</span>
		<strong>Início</strong>
	</button>

	{#each groups as group}
		{#if group.category}
			<div class="section-title">{group.category.name}</div>
		{/if}
		{#each group.channels as channel (channel.id)}
			<ChannelItem
				{channel}
				active={openChannelId === channel.id}
				onSelect={() => selectChannel(channel.id)}
			/>
		{/each}
	{/each}

	<div class="mobile-rail-shortcuts">
		<div class="section-title">ATALHOS</div>
		<div class="mobile-rail-dock" role="toolbar" aria-label="Atalhos">
			{#each shortcuts as s}
				<button
					class="mobile-rail-action"
					aria-label={s.label}
					onclick={() => navigateShortcut(s.to)}
				>
					<span class="mobile-rail-icon">
						<Icon name={s.icon} variant={s.variant} />
					</span>
					<span>{s.label}</span>
				</button>
			{/each}
		</div>
	</div>
</aside>

<style>
	button.home-link {
		font: inherit;
		text-align: left;
		-webkit-appearance: none;
		appearance: none;
	}
</style>

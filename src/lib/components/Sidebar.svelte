<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Channel } from '$lib/types';
	import { state } from '$lib/store/ui.svelte';
	import { sampleChannels, sampleServer, sampleUsers } from '$lib/sample';
	import Icon from './Icon.svelte';
	import ChannelItem from './ChannelItem.svelte';
	import MobilePanelHead from './MobilePanelHead.svelte';

	let {
		openChannelId = null,
		onSelectChannel
	} = $props<{
		openChannelId?: string | null;
		onSelectChannel?: (id: string) => void;
	}>();

	// Group channels by category (categories act as section headers).
	function computeGroups(): Array<{ category: string | null; channels: Channel[] }> {
		const result: Array<{ category: string | null; channels: Channel[] }> = [];
		let current: { category: string | null; channels: Channel[] } | null = null;
		for (const c of sampleChannels) {
			if (c.type === 'category') {
				if (current) result.push(current);
				current = { category: c.name, channels: [] };
			} else {
				if (!current) current = { category: null, channels: [] };
				current.channels.push(c);
			}
		}
		if (current) result.push(current);
		return result;
	}
	const groups = $derived(computeGroups());

	const onlineCount = $derived(sampleUsers.filter((u) => u.status === null).length);
	const drawerOpen = $derived(state.channelsDrawerOpen);

	function closeDrawer(): void {
		state.channelsDrawerOpen = false;
	}

	function selectChannel(id: string): void {
		onSelectChannel(id);
	}

	// Atalhos: only route-related shortcuts are kept (channels are sample
	// data, so the mockup channel/mockup buttons were dropped).
	const shortcuts = [
		{ to: '/admin', icon: 'shield-check', variant: 'light' as const, label: 'Administração' },
		{ to: '/user/settings', icon: 'gear', variant: 'light' as const, label: 'Ajustes' }
	];

	function navigateShortcut(to: string): void {
		state.channelsDrawerOpen = false;
		goto(to);
	}
</script>

<aside class="sidebar {drawerOpen ? 'open' : ''}">
	<MobilePanelHead
		icon="hash"
		title="Canais"
		onClose={closeDrawer}
	/>

	<div class="community">
		<div class="community-logo">
			<Icon name="users-three" variant="duotone" />
		</div>
		<div>
			<h1>{sampleServer.name}</h1>
			<p>Comunidade de amigos<br>e criadores</p>
			<p style="margin-top:7px">
				<span class="online-dot"></span>{onlineCount} Online
			</p>
		</div>
	</div>

	<button class="home-link" aria-label="Início">
		<span class="icon">
			<Icon name="house" variant="light" />
		</span>
		<strong>Início</strong>
	</button>

	{#each groups as group}
		{#if group.category}
			<div class="section-title">{group.category}</div>
		{/if}
		{#each group.channels as channel (channel.id)}
			<ChannelItem
				channel={channel}
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
					on:click={() => navigateShortcut(s.to)}
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
	button.home-link{
		font: inherit;
		text-align: left;
		-webkit-appearance: none;
		appearance: none;
	}
</style>

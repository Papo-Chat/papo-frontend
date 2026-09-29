<script lang="ts">
	import type { Channel } from '$lib/types';
	import { state as channelsState } from '$lib/store/channels.svelte';
	import Icon from './Icon.svelte';

	let {
		channel,
		active = false,
		onSelect
	} = $props<{
		channel: Channel;
		active?: boolean;
		onSelect?: () => void;
	}>();

	// Per-channel glyph (matches the mockup).
	const iconMap: Record<string, string> = {
		geral: 'chats-circle',
		design: 'paint-brush',
		anúncios: 'megaphone',
		feedback: 'heart',
		ideias: 'lightbulb',
		projetos: 'folder',
		eventos: 'calendar-dots',
		Lounge: 'speaker-high',
		Reunião: 'users-three',
		Música: 'music-notes',
		Mensagens: 'envelope-simple',
		Favoritos: 'star'
	};

	const icon = $derived(
		(iconMap[channel.name] ??
			(channel.type === 'voice' ? 'speaker-waves' : 'channel'))
	);
	const unread = $derived(channelsState.unread.get(channel.id)?.count ?? 0);
</script>

<button
	class="nav-item {active ? 'active' : ''}"
	on:click={() => onSelect && onSelect()}
	aria-current={active ? 'page' : undefined}
>
	<span class="icon">
		<Icon name={icon} variant="light" />
	</span>
	<strong>{channel.name}</strong>
	{#if channel.type !== 'category' && unread > 0}
		<span class="badge">{unread}</span>
	{/if}
</button>

<style>
	/* Reset default button styling so the .nav-item glass style applies. */
	button.nav-item {
		font: inherit;
		text-align: left;
		-webkit-appearance: none;
		appearance: none;
	}
	button.nav-item strong {
		font-size: 14px;
		margin-left: 0;
	}
</style>

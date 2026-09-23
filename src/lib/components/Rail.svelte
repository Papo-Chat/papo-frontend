<script lang="ts">
	// Leftmost vertical rail. Static navigation (matches the mockup). The
	// brand orb is the current server; the rest are quick shortcuts.
	import { sampleServer } from '$lib/sample';
	import Icon from './Icon.svelte';

	const items = [
		{ key: 'favoritos', icon: 'star', variant: 'duotone', title: 'Favoritos', muted: false },
		{ key: 'lounge', icon: 'coffee', variant: 'light', title: 'Lounge', muted: true },
		{ key: 'jogos', icon: 'game-controller', variant: 'light', title: 'Jogos', muted: true },
		{ key: 'design', icon: 'palette', variant: 'light', title: 'Design', muted: true }
	] as const;
</script>

<aside class="rail">
	<div class="brand-orb" title="{sampleServer.name}">
		<Icon name="users-three" variant="duotone" />
	</div>

	{#each items as item}
		<button
			class="rail-btn {item.muted ? 'muted' : ''}"
			title={item.title}
			aria-label={item.title}
		>
			<Icon name={item.icon} variant={item.variant} />
		</button>
	{/each}

	<div class="rail-spacer"></div>

	<button
		class="rail-btn muted"
		title="Configurações"
		aria-label="Configurações"
	>
		<Icon name="gear" variant="light" />
	</button>
</aside>

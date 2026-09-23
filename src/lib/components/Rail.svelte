<script lang="ts">
	// Leftmost vertical rail. The brand orb is the current server; only
	// route-related shortcuts are kept (channels are sample data, so the
	// mockup channel/mockup buttons were dropped).
	import { goto } from '$app/navigation';
	import { sampleServer } from '$lib/sample';
	import Icon from './Icon.svelte';
</script>

<aside class="rail">
	<div class="brand-orb" title="{sampleServer.name}">
		<Icon name="users-three" variant="duotone" />
	</div>

	<button
		class="rail-btn"
		title="Administração"
		aria-label="Administração"
		on:click={() => goto('/admin')}
	>
		<Icon name="shield-check" variant="light" />
	</button>

	<div class="rail-spacer"></div>

	<button
		class="rail-btn muted"
		title="Configurações"
		aria-label="Configurações"
		on:click={() => goto('/user/settings')}
	>
		<Icon name="gear" variant="light" />
	</button>
</aside>

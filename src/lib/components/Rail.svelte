<script lang="ts">
	// Leftmost vertical rail. The brand orb is the current server; only
	// route-related shortcuts are kept (channels are sample data, so the
	// mockup channel/mockup buttons were dropped).
	import { goto } from '$app/navigation';
	import { state as serverState } from '$lib/store/server.svelte';
	import Icon from './Icon.svelte';
	import ServerIcon from './ServerIcon.svelte';

	const server = $derived(serverState.server);
</script>

<aside class="rail">
	<div class="brand-orb" title={server?.name ?? ''} aria-hidden="true">
		<ServerIcon
			iconBlob={server?.icon_blob ?? null}
			iconFormat={server?.icon_format ?? ''}
			name={server?.name ?? ''}
			size={56}
		/>
	</div>

	<button
		class="rail-btn"
		title="Administração"
		aria-label="Administração"
		onclick={() => goto('/admin/server')}
	>
		<Icon name="shield-check" variant="light" />
	</button>

	<div class="rail-spacer"></div>

	<button
		class="rail-btn muted"
		title="Configurações"
		aria-label="Configurações"
		onclick={() => goto('/user/settings')}
	>
		<Icon name="gear" variant="light" />
	</button>
</aside>

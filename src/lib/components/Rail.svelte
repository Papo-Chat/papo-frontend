<script lang="ts">
	// Leftmost vertical rail. The brand orb is the current server; only
	// route-related shortcuts are kept (channels are sample data, so the
	// mockup channel/mockup buttons were dropped).
	import { goto } from '$app/navigation';
	import { sampleServer } from '$lib/sample';
	import Icon from './Icon.svelte';
	import ServerIcon from './ServerIcon.svelte';
</script>

<aside class="rail">
	<div class="brand-orb" title={sampleServer.name} aria-hidden="true">
		<ServerIcon
			iconBlob={sampleServer.icon_blob}
			iconFormat={sampleServer.icon_format}
			name={sampleServer.name}
			size={56}
		/>
	</div>

	<button
		class="rail-btn"
		title="Administração"
		aria-label="Administração"
		on:click={() => goto('/admin/server')}
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

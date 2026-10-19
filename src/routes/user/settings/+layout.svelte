<script lang="ts">
	// Settings shell: same back-office chrome as admin, with its own
	// nav (Configurações / Perfil / Aero).
	import { state as serverState } from '$lib/store/server.svelte';
	import type { Snippet } from 'svelte';
	import Shell from '$lib/components/Shell.svelte';

	let { children } = $props<{ children: Snippet }>();

	const server = $derived(serverState.server);

	const nav = [
		{ to: '/user/settings', label: 'Configurações', icon: 'gear' },
		{ to: '/user/settings/profile', label: 'Perfil', icon: 'user' },
		{ to: '/user/settings/blocked', label: 'Bloqueados', icon: 'user-minus' },
		{ to: '/user/settings/aero', label: 'Aero', icon: 'wind' }
	];
</script>

<Shell
	brandIcon="gear"
	brandSub="Configurações"
	server={server ?? undefined}
	backUrl="/channels/geral"
	backLabel="Voltar ao chat"
	{nav}
>
	{@render children()}
</Shell>

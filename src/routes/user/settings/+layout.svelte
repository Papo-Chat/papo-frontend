<script lang="ts">
	// Settings shell: same back-office chrome as admin, with its own
	// nav (Configurações / Perfil / Aero).
	import { sampleServer } from '$lib/sample';
	import Shell from '$lib/components/Shell.svelte';

	const nav = [
		{ to: '/user/settings', label: 'Configurações', icon: 'gear' },
		{ to: '/user/settings/profile', label: 'Perfil', icon: 'user' },
		{ to: '/user/settings/aero', label: 'Aero', icon: 'wind' }
	];
</script>

<Shell
	brandIcon="gear"
	brandSub="Configurações"
	server={sampleServer}
	backUrl="/channels/geral"
	backLabel="Voltar ao chat"
	{nav}
>
	<slot />
</Shell>

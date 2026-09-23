<script lang="ts">
	// Settings shell: same back-office chrome as admin, with its own
	// nav (Configurações / Perfil).
	import Shell from '$lib/components/Shell.svelte';

	const nav = [
		{ to: '/user/settings', label: 'Configurações', icon: 'gear' },
		{ to: '/user/settings/profile', label: 'Perfil', icon: 'user' }
	];
</script>

<Shell
	brandIcon="gear"
	brandSub="Configurações"
	backUrl="/channels/geral"
	backLabel="Voltar ao chat"
	nav={nav}
>
	<slot />
</Shell>

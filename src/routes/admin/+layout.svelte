<script lang="ts">
	// Server admin shell: shared back-office chrome (top bar + left nav +
	// content slot) via Shell, with the server-admin nav.
	import { state as serverState } from '$lib/store/server.svelte';
	import Shell from '$lib/components/Shell.svelte';

	const server = $derived(serverState.server);

	const nav = [
		{ to: '/admin/server', label: 'Servidor', icon: 'server' },
		{ to: '/admin/channels', label: 'Canais', icon: 'chat' },
		{ to: '/admin/roles', label: 'Roles', icon: 'shield-check' },
		{ to: '/admin/emojis', label: 'Emojis', icon: 'smiley' },
		{ to: '/admin/users', label: 'Usuários', icon: 'users-three' },
		{ to: '/admin/audit', label: 'Auditoria', icon: 'magnifying-glass' }
	];
</script>

<Shell
	brandIcon="server"
	brandSub="Administração"
	server={server ?? undefined}
	backUrl="/channels/geral"
	backLabel="Voltar ao chat"
	{nav}
>
	<slot />
</Shell>

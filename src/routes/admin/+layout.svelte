<script lang="ts">
	// Server admin shell: shared back-office chrome (top bar + left nav +
	// content slot) via Shell, with the server-admin nav.
	import { sampleServer } from '$lib/sample';
	import Shell from '$lib/components/Shell.svelte';

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
	server={sampleServer}
	backUrl="/channels/geral"
	backLabel="Voltar ao chat"
	nav={nav}
>
	<slot />
</Shell>

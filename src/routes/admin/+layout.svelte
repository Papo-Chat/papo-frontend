<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { state as serverState } from '$lib/store/server.svelte';
	import { state as sessionState, meId } from '$lib/store/session.svelte';
	import * as rolesStore from '$lib/store/roles.svelte';
	import { can } from '$lib/store/roles.svelte';
	import Shell from '$lib/components/Shell.svelte';

	const server = $derived(serverState.server);
	const me = $derived(meId());
	const isOwner = $derived(!!me && server?.owner_id === me);
	const myRoleIds = $derived(new Set(sessionState.roles.map((r) => r.id)));
	const myRoles = $derived(rolesStore.state.list.filter((r) => myRoleIds.has(r.id)));
	const ctx = $derived({ roles: myRoles, isOwner });

	const canManageServer = $derived(!server && !!me ? true : can('manage_server', ctx));
	const canManageChannels = $derived(can('manage_channels', ctx));
	const canManageRoles = $derived(can('manage_roles', ctx));
	const canManageUsers = $derived(canManageServer || canManageRoles);

	const nav = $derived([
		...(canManageServer ? [{ to: '/admin/server', label: 'Servidor', icon: 'server' }] : []),
		...(canManageChannels ? [{ to: '/admin/channels', label: 'Canais', icon: 'chat' }] : []),
		...(canManageRoles ? [{ to: '/admin/roles', label: 'Roles', icon: 'shield-check' }] : []),
		...(canManageServer ? [{ to: '/admin/emojis', label: 'Emojis', icon: 'smiley' }] : []),
		...(canManageUsers ? [{ to: '/admin/users', label: 'Usuários', icon: 'users-three' }] : []),
		...(canManageServer ? [{ to: '/admin/audit', label: 'Auditoria', icon: 'magnifying-glass' }] : [])
	]);

	function routeAllowed(pathname: string): boolean {
		if (pathname.startsWith('/admin/server')) return canManageServer;
		if (pathname.startsWith('/admin/channels')) return canManageChannels;
		if (pathname.startsWith('/admin/roles')) return canManageRoles;
		if (pathname.startsWith('/admin/emojis')) return canManageServer;
		if (pathname.startsWith('/admin/users')) return canManageUsers;
		if (pathname.startsWith('/admin/audit')) return canManageServer;
		return nav.length > 0;
	}

	$effect(() => {
		if (!sessionState.loaded || !rolesStore.state.loaded || !serverState.loaded) return;
		if (routeAllowed(page.url.pathname)) return;
		void goto(nav[0]?.to ?? '/channels/geral', { replaceState: true });
	});
</script>

{#if nav.length}
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
{/if}

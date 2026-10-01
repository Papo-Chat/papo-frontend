<script lang="ts">
	// Leftmost vertical rail. The brand orb is the current server; only
	// route-related shortcuts are kept (channels are sample data, so the
	// mockup channel/mockup buttons were dropped).
	import { goto } from '$app/navigation';
	import { state as serverState } from '$lib/store/server.svelte';
	import { state as sessionState, meId, logout } from '$lib/store/session.svelte';
	import * as rolesStore from '$lib/store/roles.svelte';
	import { can } from '$lib/store/roles.svelte';
	import Icon from './Icon.svelte';
	import ServerIcon from './ServerIcon.svelte';

	const server = $derived(serverState.server);
	const me = $derived(meId());
	const isOwner = $derived(!!me && server?.owner_id === me);
	const myRoleIds = $derived(new Set(sessionState.roles.map((r) => r.id)));
	const myRoles = $derived(rolesStore.state.list.filter((r) => myRoleIds.has(r.id)));
	const adminCtx = $derived({ roles: myRoles, isOwner });
	const canManageServer = $derived((!server && !!me) || can('manage_server', adminCtx));
	const canManageChannels = $derived(can('manage_channels', adminCtx));
	const canManageRoles = $derived(can('manage_roles', adminCtx));
	const canOpenAdmin = $derived(canManageServer || canManageChannels || canManageRoles);
	let loggingOut = $state(false);

	async function doLogout(): Promise<void> {
		if (loggingOut) return;
		loggingOut = true;
		try {
			await logout();
			await goto('/auth');
		} finally {
			loggingOut = false;
		}
	}

	const adminRoute = $derived(
		canManageServer
			? '/admin/server'
			: canManageChannels
				? '/admin/channels'
				: '/admin/roles'
	);
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

	{#if canOpenAdmin}
		<button
			class="rail-btn"
			title="Administração"
			aria-label="Administração"
			onclick={() => goto(adminRoute)}
		>
			<Icon name="shield-check" variant="light" />
		</button>
	{/if}

	<div class="rail-spacer"></div>

	<button
		class="rail-btn muted"
		title="Configurações"
		aria-label="Configurações"
		onclick={() => goto('/user/settings')}
	>
		<Icon name="gear" variant="light" />
	</button>

	<button
		class="rail-btn rail-logout"
		title="Sair"
		aria-label="Sair"
		disabled={loggingOut}
		onclick={doLogout}
	>
		<Icon name="door-open" variant="light" />
	</button>
</aside>

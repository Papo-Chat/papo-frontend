<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { state as serverState } from '$lib/store/server.svelte';
	import { state as sessionState, meId, logout } from '$lib/store/session.svelte';
	import { state as uiState } from '$lib/store/ui.svelte';
	import * as rolesStore from '$lib/store/roles.svelte';
	import * as channelsStore from '$lib/store/channels.svelte';
	import * as dmsStore from '$lib/store/dms.svelte';
	import { can } from '$lib/store/roles.svelte';
	import Icon from './Icon.svelte';
	import ServerIcon from './ServerIcon.svelte';
	import DmRailItem from './DmRailItem.svelte';

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
	const activeDmId = $derived(page.url.pathname.match(/^\/dm\/([^/]+)/)?.[1] ?? null);
	let loggingOut = $state(false);

	const adminRoute = $derived(
		canManageServer
			? '/admin/server'
			: canManageChannels
				? '/admin/channels'
				: '/admin/roles'
	);

	$effect(() => {
		if (me && !dmsStore.state.loaded && !dmsStore.state.loading) {
			void dmsStore.load().catch(() => {});
		}
	});

	function closeMobileRail(): void {
		uiState.railDrawerOpen = false;
	}

	async function goHome(): Promise<void> {
		closeMobileRail();
		const home = channelsStore.homeChannel();
		await goto(home ? `/channels/${home.id}` : '/');
	}

	function openMembers(): void {
		uiState.railDrawerOpen = false;
		uiState.channelsDrawerOpen = false;
		uiState.voiceChatDrawerOpen = false;
		uiState.membersDrawerOpen = false;
		uiState.dmDirectoryOpen = true;
	}

	async function openDm(id: string): Promise<void> {
		dmsStore.setOpen(id);
		closeMobileRail();
		await goto(`/dm/${id}`);
	}

	async function hideDm(id: string): Promise<void> {
		try {
			await dmsStore.hide(id);
			if (activeDmId === id) {
				await goHome();
			}
		} catch {
			// Keep the item visible when the server did not confirm the close.
		}
	}

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
</script>

<aside class="rail {uiState.railDrawerOpen ? 'rail-mobile-open' : ''}" aria-label="Navegação principal">
	<button
		class="rail-mobile-close"
		type="button"
		onclick={closeMobileRail}
		aria-label="Fechar navegação"
		title="Fechar"
	>
		<Icon name="x" variant="light" size={16} />
	</button>

	<button class="brand-orb rail-brand-button" type="button" title={server?.name ?? 'Início'} aria-label="Voltar aos canais" onclick={() => void goHome()}>
		<ServerIcon
			iconBlob={server?.icon_blob ?? null}
			iconFormat={server?.icon_format ?? ''}
			name={server?.name ?? ''}
			size={56}
		/>
	</button>

	{#if canOpenAdmin}
		<button
			class="rail-btn"
			title="Administração"
			aria-label="Administração"
			onclick={() => {
				closeMobileRail();
				void goto(adminRoute);
			}}
		>
			<Icon name="shield-check" variant="light" />
		</button>
	{/if}

	<button
		class="rail-btn muted"
		title="Membros"
		aria-label="Abrir membros"
		onclick={openMembers}
	>
		<Icon name="users-three" variant="light" />
	</button>

	<div class="rail-divider" aria-hidden="true"></div>

	<div class="rail-dms" aria-label="Mensagens diretas">
		{#each dmsStore.state.ordered as id (id)}
			{@const dm = dmsStore.state.byId.get(id)}
			{#if dm}
				<DmRailItem
					{dm}
					active={activeDmId === id}
					onOpen={() => void openDm(id)}
					onClose={() => void hideDm(id)}
				/>
			{/if}
		{/each}
	</div>

	<button
		class="rail-btn muted"
		title="Configurações"
		aria-label="Configurações"
		onclick={() => {
			closeMobileRail();
			void goto('/user/settings');
		}}
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

<style>
	.rail-brand-button {
		padding: 0;
		cursor: pointer;
		color: inherit;
	}

	.rail-divider {
		width: 34px;
		height: 1px;
		flex: 0 0 1px;
		background: rgba(255, 255, 255, 0.2);
	}

	.rail-dms {
		width: 100%;
		min-height: 0;
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		overflow-y: auto;
		overflow-x: hidden;
		scrollbar-width: none;
		overscroll-behavior: contain;
	}

	.rail-dms::-webkit-scrollbar {
		display: none;
	}

	.rail-mobile-close {
		display: none;
		width: 34px;
		height: 34px;
		padding: 0;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.24);
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
		cursor: pointer;
	}

	:global([data-theme='dark']) .rail-divider {
		background: rgba(255, 255, 255, 0.14);
	}

	:global(html[data-ui-flat]) .rail-dms,
	:global(html[data-ui-flat]) .rail-mobile-close {
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	@media (max-width: 700px) {
		:global(.rail.rail-mobile-open) {
			display: flex !important;
			position: absolute;
			inset: 8px auto 8px 8px;
			z-index: 180;
			width: 74px;
			height: auto;
			box-sizing: border-box;
			padding: 10px 10px;
			border: 1px solid rgba(255, 255, 255, 0.24);
			border-radius: 20px;
			box-shadow: 0 18px 42px rgba(3, 39, 72, 0.3);
		}

		.rail-mobile-close {
			display: grid;
		}

		:global(html[data-ui-mobile] .rail.rail-mobile-open) {
			box-shadow: 0 12px 28px rgba(2, 31, 57, 0.28);
		}
	}
</style>

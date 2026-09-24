<script lang="ts">
	// Shared shell for admin + settings back-office pages: top bar
	// (back + brand) + left nav + content slot.
	import { page } from '$app/state';
	import type { Server } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import ServerIcon from '$lib/components/ServerIcon.svelte';

	type NavItem = { to: string; label: string; icon: string };

	let {
		backUrl = null,
		backLabel = 'Voltar ao chat',
		brandIcon = 'server',
		brandName = 'AeroClub',
		brandSub = 'Administração',
		nav = [] as NavItem[],
		server
	} = $props<{
		backUrl?: string | null;
		backLabel?: string;
		brandIcon?: string;
		brandName?: string;
		brandSub?: string;
		nav: NavItem[];
		server?: Server;
	}>();

	// Exact match first, then prefix (with trailing slash) so the first
	// route doesn't match every child route.
	const current = $derived(
		nav.find((n: NavItem) => page.url.pathname === n.to) ??
			nav.find((n: NavItem) => n.to !== nav[0].to && page.url.pathname.startsWith(n.to + '/')) ??
			nav[0].to
	);
</script>

<div class="admin-shell">
	<header class="admin-topbar">
		{#if backUrl}
			<a class="admin-back" href={backUrl} aria-label={backLabel}>
				<Icon name="arrow-left" variant="light" />
				<span>{backLabel}</span>
			</a>
		{/if}

		<div class="admin-brand">
			<div class="admin-brand-mark" aria-hidden="true">
				{#if server}
					<ServerIcon
						iconBlob={server.icon_blob}
						iconFormat={server.icon_format}
						name={server.name}
						size={34}
						dark
					/>
				{:else}
					<Icon name={brandIcon} variant="duotone" size={18} />
				{/if}
			</div>
			<div>
				<span class="admin-brand-name">{brandName}</span>
				<span class="admin-brand-sub">{brandSub}</span>
			</div>
		</div>

		<div class="admin-topbar-spacer" />
	</header>

	<div class="admin-layout">
		<nav class="admin-nav" aria-label="Navegação">
			{#each nav as item (item.to)}
				<a
					class="dash-tab {item.to === current ? 'active' : ''}"
					href={item.to}
					aria-current={item.to === current ? 'page' : undefined}
				>
					{#if item.icon === 'server' && server}
						<span class="dash-tab-server-icon">
							<ServerIcon
								iconBlob={server.icon_blob}
								iconFormat={server.icon_format}
								name={server.name}
								size={15}
								dark={item.to === current}
							/>
						</span>
					{:else}
						<Icon name={item.icon} variant="light" size={15} />
					{/if}
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>

		<main class="admin-main">
			<slot />
		</main>
	</div>
</div>

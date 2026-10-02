import { redirect } from '@sveltejs/kit';
import { load as sessionLoad, state as sessionState, meId } from '$lib/store/session.svelte';
import * as serverStore from '$lib/store/server.svelte';
import * as channelsStore from '$lib/store/channels.svelte';
import * as rolesStore from '$lib/store/roles.svelte';
import { can } from '$lib/utils/permissions';

function allowedRoutes(): string[] {
	const me = meId();
	const server = serverStore.state.server;
	const isOwner = !!me && server?.owner_id === me;
	const roleIds = new Set(sessionState.roles.map((r) => r.id));
	const roles = rolesStore.state.list.filter((r) => roleIds.has(r.id));
	const ctx = { roles, isOwner };

	const manageServer = (!server && !!me) || can('manage_server', ctx);
	const manageChannels = can('manage_channels', ctx);
	const manageRoles = can('manage_roles', ctx);
	const manageUsers = manageServer || manageRoles;

	return [
		...(manageServer ? ['/admin/server', '/admin/emojis', '/admin/audit'] : []),
		...(manageChannels ? ['/admin/channels'] : []),
		...(manageRoles ? ['/admin/roles'] : []),
		...(manageUsers ? ['/admin/users'] : [])
	];
}

function pathAllowed(pathname: string, routes: string[]): boolean {
	return routes.some((route) => pathname === route || pathname.startsWith(route + '/'));
}

export async function load({ url }: { url: URL }): Promise<void> {
	if (!sessionState.userId) {
		try {
			await sessionLoad();
		} catch {
			redirect(307, '/auth');
		}
	}

	if (!sessionState.userId) {
		redirect(307, '/auth');
	}

	if (!serverStore.state.loaded) {
		await serverStore.load();
	}

	// First-run bootstrap: before the singleton server exists, the only
	// meaningful admin route is the server creation screen. Do not preload
	// channels/roles that depend on a configured server.
	if (!serverStore.state.server) {
		if (url.pathname === '/admin/server' || url.pathname.startsWith('/admin/server/')) {
			return;
		}
		redirect(307, '/admin/server');
	}

	if (!channelsStore.state.loaded) {
		await channelsStore.load();
	}
	if (!rolesStore.state.loaded) {
		await rolesStore.load();
	}

	const routes = allowedRoutes();
	if (pathAllowed(url.pathname, routes)) {
		return;
	}

	redirect(307, routes[0] ?? '/channels/geral');
}

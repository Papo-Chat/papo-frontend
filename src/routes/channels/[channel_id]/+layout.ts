// Guard do canal: sessão, servidor, canais e validação do channel_id.
import { redirect } from '@sveltejs/kit';
import { load as sessionLoad, state as sessionState } from '$lib/store/session.svelte';
import * as channelsStore from '$lib/store/channels.svelte';
import * as serverStore from '$lib/store/server.svelte';
import * as rolesStore from '$lib/store/roles.svelte';
import * as messagesStore from '$lib/store/messages.svelte';
import { channelAccess } from '$lib/utils/permissions';
import type { Channel } from '$lib/types';

// Fallback para o ID do canal a partir da URL durante a hidratação.
function channelIdFromPathname(pathname: string): string | null {
	const m = pathname.match(/^\/channels\/([^/]+)/);
	return m ? m[1] : null;
}

export async function load({
	params,
	url
}: {
	params: { channel_id?: string | undefined };
	url: { pathname: string };
}): Promise<void> {
	// 1. Sessão.
	if (!sessionState.userId) {
		try {
			await sessionLoad();
		} catch {
			redirect(307, '/auth');
			return;
		}
	}
	if (!sessionState.userId) {
		redirect(307, '/auth');
		return;
	}

	// 2. Servidor e canais.
	if (!serverStore.state.loaded) {
		await serverStore.load();
	}
	if (!channelsStore.state.loaded) {
		await channelsStore.load();
	}
	// As roles são necessárias para aplicar a mesma regra de acesso da sidebar.
	if (!rolesStore.state.loaded) {
		await rolesStore.load();
	}

	const me = sessionState.userId;
	const server = serverStore.state.server;
	const myRoleIds = new Set(sessionState.roles.map((role) => role.id));
	const myRoles = rolesStore.state.list.filter((role) => myRoleIds.has(role.id));
	const accessContext = {
		roles: myRoles,
		isOwner: !!me && server?.owner_id === me
	};
	const canReadChannel = (channel: Channel) =>
		channel.type !== 'category' && channelAccess(channel, accessContext).read;

	// 3. Só abre o canal solicitado se o usuário puder lê-lo.
	const channelId = params.channel_id ?? channelIdFromPathname(url.pathname);
	const channel = channelsStore.resolve(channelId);
	if (channel && canReadChannel(channel)) {
		channelsStore.setOpen(channel.id);
		// Carrega as mensagens sem bloquear a navegação.
		void messagesStore.setLatest(channel.id);
		return;
	}

	// 4. Canal inválido ou sem permissão: redireciona para o primeiro canal
	// acessível, priorizando canais de texto como no comportamento de home.
	const home = channelsStore.homeChannel(canReadChannel);
	if (home) {
		channelsStore.setOpen(home.id);
		if (channelId !== home.id) {
			redirect(307, `/channels/${home.id}`);
		}
		return;
	}

	// 5. Não há canal acessível.
	redirect(307, '/admin/server');
}

// Bootstrap for the root: the single entry point of the app.
//
// Flow (integration plan §2):
//   1. Sessão  → whoami. 401 / sem cookie → /auth.
//   2. Servidor → GET /server. Não criado (404) → tela de criação (/admin/server).
//   3. Canais   → lista dos canais + define o canal "home".
//   4. Redireciona para /channels/<home> (queda direta quando há cookie).
//
// A guard dos canais (channels/+layout.ts) replica o mesmo fluxo para links
// profundos, então este arquivo pode ser entendido como o bootstrap canônico.

import { redirect } from '@sveltejs/kit';
import { load as sessionLoad, state as sessionState } from '$lib/store/session.svelte';
import * as channelsStore from '$lib/store/channels.svelte';
import * as serverStore from '$lib/store/server.svelte';

export async function load(): Promise<void> {
	// 1. Sessão.
	try {
		await sessionLoad();
	} catch {
		// whoami 401 / erro → não autenticado.
		redirect(307, '/auth');
		return;
	}
	if (!sessionState.userId) {
		redirect(307, '/auth');
		return;
	}

	// 2. Servidor (singleton).
	const server = await serverStore.load();
	if (!server) {
		// Servidor ainda não foi criado.
		redirect(307, '/admin/server');
		return;
	}

	// 3. Canais.
	await channelsStore.load();
	const home = channelsStore.homeChannel();
	if (!home) {
		// Nenhum canal: mandar para a administração (criar canal).
		redirect(307, '/admin/server');
		return;
	}

	// 4. Canal "home": primeiro canal de texto (fallback: qualquer canal).
	channelsStore.setOpen(home.id);
	redirect(307, `/channels/${home.id}`);
}

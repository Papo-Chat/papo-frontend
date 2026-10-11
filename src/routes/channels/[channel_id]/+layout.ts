// Guard do canal: sessão, servidor, canais e validação do channel_id.
//
// Vive todo aqui, num único load, porque:
//
//   1. o channel_id só existe no segmento [channel_id]; o código que dele
//      depende fica na rota que o define;
//
//   2. os loads do SvelteKit rodam em paralelo por nível da hierarquia
//      (runtime/client: branch_promises = loaders.map(async ... => load_node))
//      — um load que depende do efeito colateral de outro load ("o parent
//      carrega os canais" / "o child lê a store") cria race condition em
//      navegações completas. Carregar e consumir precisa estar no mesmo load.
//
// Não usa `$app/state.page` dentro do load: durante a hidratação o $app/state
// .page pode existir temporariamente com url="a:" / params={} (estado
// intermediário) — o parâmetro é lido do LoadEvent que o SvelteKit passa ao
// load.
import { redirect } from '@sveltejs/kit';
import { load as sessionLoad, state as sessionState } from '$lib/store/session.svelte';
import * as channelsStore from '$lib/store/channels.svelte';
import * as serverStore from '$lib/store/server.svelte';
import * as messagesStore from '$lib/store/messages.svelte';

// Fallback para o ID do canal a partir da URL, caso `params.channel_id`
// esteja vazio no LoadEvent (defesa extra contra o estado intermediário de
// hidratação).
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
	// 1. Sessão (só se ainda não foi carregada — o bootstrap raiz já fez).
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

	// 2. Servidor (para Rail/Sidebar) — só se ainda não carregado.
	if (!serverStore.state.loaded) {
		await serverStore.load();
	}

	// 3. Canais — só se ainda não carregados.
	if (!channelsStore.state.loaded) {
		await channelsStore.load();
	}

	// 4. Resolver o canal da URL (id exato, depois nome) — LoadEvent `params`,
	// com fallback na URL.
	const channelId = params.channel_id ?? channelIdFromPathname(url.pathname);

	const channel = channelsStore.resolve(channelId);
	if (channel) {
		channelsStore.setOpen(channel.id);

		// Start fetching the latest window immediately, but do not make route
		// navigation wait for message history. Chat.svelte defers its initial
		// scroll positioning while this store is loading, and the page-level
		// setLatest() call is deduped by the store's in-flight request map.
		void messagesStore.setLatest(channel.id);
		return;
	}

	// 5. Param inválido / não encontrado: cai no canal "home".
	const home = channelsStore.homeChannel();
	if (home) {
		channelsStore.setOpen(home.id);
		// Redireção idempotente: se já estamos no home, só define o open
		// e termina (segunda defesa contra loop de redirect).
		if (channelId !== home.id) {
			redirect(307, `/channels/${home.id}`);
		}
		return;
	}

	// 6. Sem canais: administração.
	redirect(307, '/admin/server');
}

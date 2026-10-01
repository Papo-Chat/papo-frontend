import { redirect } from '@sveltejs/kit';
import { ApiError } from '$lib/api';
import { load as sessionLoad, state as sessionState } from '$lib/store/session.svelte';
import * as channelsStore from '$lib/store/channels.svelte';
import * as dmsStore from '$lib/store/dms.svelte';
import * as serverStore from '$lib/store/server.svelte';

function dmIdFromPathname(pathname: string): string | null {
	const match = pathname.match(/^\/dm\/([^/]+)/);
	return match ? match[1] : null;
}

function homePath(): string {
	const home = channelsStore.homeChannel();
	return home ? `/channels/${home.id}` : '/';
}

export async function load({
	params,
	url
}: {
	params: { dm_id?: string | undefined };
	url: { pathname: string };
}): Promise<void> {
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

	if (!serverStore.state.loaded) {
		await serverStore.load();
	}
	if (!channelsStore.state.loaded) {
		await channelsStore.load();
	}
	if (!dmsStore.state.loaded) {
		await dmsStore.load();
	}

	const dmId = params.dm_id ?? dmIdFromPathname(url.pathname);
	if (!dmId) {
		redirect(307, homePath());
		return;
	}

	try {
		const dm = await dmsStore.openById(dmId);
		dmsStore.setOpen(dm.id);
		channelsStore.setOpen(null);
	} catch (error) {
		if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
			redirect(307, homePath());
			return;
		}
		throw error;
	}
}

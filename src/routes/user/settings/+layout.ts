import { redirect } from '@sveltejs/kit';
import { load as sessionLoad, state as sessionState } from '$lib/store/session.svelte';
import * as serverStore from '$lib/store/server.svelte';
import * as channelsStore from '$lib/store/channels.svelte';

export async function load(): Promise<void> {
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
	if (!channelsStore.state.loaded) {
		await channelsStore.load();
	}
}

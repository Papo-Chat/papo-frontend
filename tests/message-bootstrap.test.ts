import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as websocketStore from '../src/lib/store/websocket.svelte';
import * as messagesStore from '../src/lib/store/messages.svelte';
import * as channelsStore from '../src/lib/store/channels.svelte';
import * as dmsStore from '../src/lib/store/dms.svelte';
import type { WsPresenceSync } from '../src/lib/types';

beforeEach(() => {
	channelsStore.state.openChannelId = 'ch1';
	dmsStore.state.openDmId = null;
});

afterEach(() => {
	vi.restoreAllMocks();
	channelsStore.state.openChannelId = null;
	dmsStore.state.openDmId = null;
});

describe('initial message history recovery', () => {
	it('ensures the currently open channel history', async () => {
		const ensureLoaded = vi.spyOn(messagesStore, 'ensureLoaded').mockResolvedValue(undefined);

		websocketStore.ensureOpenMessageHistory();

		await vi.waitFor(() => {
			expect(ensureLoaded).toHaveBeenCalledWith('ch1');
		});
	});

	it('retries open history when presence_sync confirms the fresh websocket session', async () => {
		const ensureLoaded = vi.spyOn(messagesStore, 'ensureLoaded').mockResolvedValue(undefined);
		const event = {
			type: 'presence_sync',
			members: []
		} satisfies WsPresenceSync;

		websocketStore.dispatchEvent(event);

		await vi.waitFor(() => {
			expect(ensureLoaded).toHaveBeenCalledWith('ch1');
		});
	});
});

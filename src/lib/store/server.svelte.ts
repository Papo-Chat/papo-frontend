// Server store — the app's single (singleton) server. The backend hosts at
// most one server per user. Mirrors the channels store shape: state plus
// load / create / update / reset.
//
// - `load()` → GET /server. A 404 (server not yet created) resolves to `null`;
//   the caller decides how to react (redirect to the create flow).
// - `create()` → POST /server (409 when already created).
// - `update()` → PUT /server.
// - `reset()` — called by the session store on logout / 401 / account switch.

import { api } from '../api';
import { currentSessionEpoch, isCurrentSessionEpoch } from '../utils/session-epoch';
import type {
	CreateServerRequest,
	Server,
	UpdateServerRequest
} from '../types';

export const state = $state({
	server: null as Server | null,
	loaded: false,
	loading: false
});

// GET /server. Returns the server, or null when it has not been created yet
// (404). A stale-session / 401 rejection propagates (the 401 hook has
// already cleared the local session).
export async function load(): Promise<Server | null> {
	const epoch = currentSessionEpoch();
	try {
		const server = await api.server.get();
		if (!isCurrentSessionEpoch(epoch)) {
			return null;
		}
		state.server = server;
		state.loaded = true;
		return server;
	} catch {
		// Stale session / 401 / network: leave `server` untouched (the session
		// store already tore it down on 401). A 404 already resolved to null
		// via api.server.get().
		return state.server;
	} finally {
		state.loading = false;
	}
}

// POST /server. 409 when a server already exists (max 1 per user).
export async function create(req: CreateServerRequest): Promise<Server> {
	const epoch = currentSessionEpoch();
	const server = await api.server.create(req);
	if (!isCurrentSessionEpoch(epoch)) {
		return server;
	}
	state.server = server;
	state.loaded = true;
	return server;
}

// PUT /server.
export async function update(req: UpdateServerRequest): Promise<Server> {
	const epoch = currentSessionEpoch();
	const server = await api.server.update(req);
	if (!isCurrentSessionEpoch(epoch)) {
		return server;
	}
	state.server = server;
	return server;
}

// Full reset (logout / 401 / account switch).
export function reset(): void {
	state.server = null;
	state.loaded = false;
	state.loading = false;
}

// Webhooks store: a lista de webhooks ativos (gestão) mais as ações de
// criação, identidade persistente e revogação. O token em texto puro só existe
// na resposta de criação — o store nunca o guarda.

import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api';
import { currentSessionEpoch, isCurrentSessionEpoch } from '../utils/session-epoch';
import type { ExternalAuthor, UpdateWebhookIdentityRequest, Webhook } from '../types';

const MAX_IDENTITY_SNAPSHOTS = 200;

interface WebhookIdentitySnapshot {
	name: string;
	createdAt: string;
}

export const state = $state({
	byId: new SvelteMap<string, Webhook>(),
	// Message snapshots provide a lightweight fallback when the caller cannot
	// access the management-only GET /webhooks endpoint.
	identitySnapshots: new SvelteMap<string, WebhookIdentitySnapshot>(),
	list: [] as Webhook[],
	loaded: false,
	loading: false
});

export async function load(): Promise<void> {
	const epoch = currentSessionEpoch();
	state.loading = true;
	try {
		const webhooks = await api.webhooks.list();
		if (!isCurrentSessionEpoch(epoch)) {
			throw new Error('stale session');
		}
		const map = new SvelteMap<string, Webhook>();
		for (const w of webhooks) {
			map.set(w.id, w);
		}
		state.byId = map;
		state.list = webhooks;
		state.loaded = true;
	} finally {
		if (isCurrentSessionEpoch(epoch)) {
			state.loading = false;
		}
	}
}

// Cria um webhook e retorna também o token de acesso em texto puro (única vez
// em que ele existe; a tabela guarda apenas o hash).
export async function create(
	channelId: string,
	name: string
): Promise<{ webhook: Webhook; token: string }> {
	const epoch = currentSessionEpoch();
	const res = await api.webhooks.create({ channel_id: channelId, name });
	if (!isCurrentSessionEpoch(epoch)) {
		throw new Error('stale session');
	}
	const { token, ...webhook } = res;
	state.byId.set(webhook.id, webhook);
	state.list = [webhook, ...state.list];
	return { webhook, token };
}

// Atualiza a identidade persistente (nickname e/ou avatar). Campos ausentes
// preservam o valor atual.
export async function updateIdentity(
	id: string,
	req: UpdateWebhookIdentityRequest
): Promise<Webhook> {
	const epoch = currentSessionEpoch();
	const webhook = await api.webhooks.updateIdentity(id, req);
	if (!isCurrentSessionEpoch(epoch)) {
		throw new Error('stale session');
	}
	state.byId.set(webhook.id, webhook);
	state.list = state.list.map((w) => (w.id === webhook.id ? webhook : w));
	return webhook;
}

// Revoga o webhook (soft delete): o token deixa de autenticar; mensagens já
// enviadas mantêm a atribuição.
export async function revoke(id: string): Promise<void> {
	await api.webhooks.revoke(id);
	state.byId.delete(id);
	state.identitySnapshots.delete(id);
	state.list = state.list.filter((w) => w.id !== id);
}

// Seed or refresh the cached display nickname from message payloads. Only the
// webhook's own persistent identity is global; custom external_author aliases
// are per-message and must not rename every message from the webhook.
export function observeMessageIdentity(
	webhookId: string,
	author: ExternalAuthor,
	createdAt: string
): void {
	if (author.source !== 'webhook' || author.id !== webhookId || !author.name) return;

	const current = state.identitySnapshots.get(webhookId);
	if (current && current.createdAt >= createdAt) return;
	// Refresh insertion order and cap the cache for long-lived/mobile sessions.
	state.identitySnapshots.delete(webhookId);
	state.identitySnapshots.set(webhookId, { name: author.name, createdAt });
	while (state.identitySnapshots.size > MAX_IDENTITY_SNAPSHOTS) {
		const oldestId = state.identitySnapshots.keys().next().value;
		if (!oldestId) break;
		state.identitySnapshots.delete(oldestId);
	}
}

// Reads SvelteMap-backed values so existing messages rerender when an identity
// changes locally (management UI) or a newer message supplies a fresh snapshot.
export function displayName(webhookId: string, fallback = 'Webhook'): string {
	const managed = state.byId.get(webhookId);
	if (managed) return managed.display_name || managed.name || fallback;
	return state.identitySnapshots.get(webhookId)?.name || fallback;
}

export function reset(): void {
	state.byId = new SvelteMap<string, Webhook>();
	state.identitySnapshots = new SvelteMap<string, WebhookIdentitySnapshot>();
	state.list = [];
	state.loaded = false;
	state.loading = false;
}

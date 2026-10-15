// Webhooks store: a lista de webhooks ativos (gestão) mais as ações de
// criação, identidade persistente e revogação. O token em texto puro só existe
// na resposta de criação — o store nunca o guarda.

import { SvelteMap } from 'svelte/reactivity';
import { api } from '../api';
import { currentSessionEpoch, isCurrentSessionEpoch } from '../utils/session-epoch';
import type { ExternalAuthor, Webhook, UpdateWebhookIdentityRequest } from '../types';

interface WebhookDisplayIdentity {
	name: string;
	display_name: string | null;
	// Management responses are authoritative; message snapshots only seed the cache.
	source: 'message' | 'management';
	observedAt: string;
}

export const state = $state({
	byId: new SvelteMap<string, Webhook>(),
	identities: new SvelteMap<string, WebhookDisplayIdentity>(),
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
		const identities = new SvelteMap<string, WebhookDisplayIdentity>();
		for (const w of webhooks) {
			map.set(w.id, w);
			identities.set(w.id, {
				name: w.name,
				display_name: w.display_name,
				source: 'management',
				observedAt: ''
			});
		}
		state.byId = map;
		state.identities = identities;
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
	rememberManagedIdentity(webhook);
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
	rememberManagedIdentity(webhook);
	state.list = state.list.map((w) => (w.id === webhook.id ? webhook : w));
	return webhook;
}

// Revoga o webhook (soft delete): o token deixa de autenticar; mensagens já
// enviadas mantêm a atribuição.
export async function revoke(id: string): Promise<void> {
	await api.webhooks.revoke(id);
	state.byId.delete(id);
	state.identities.delete(id);
	state.list = state.list.filter((w) => w.id !== id);
}

// Seed identity from message snapshots without requesting the management-only
// webhook list. Newer messages can refresh a snapshot; a management response wins.
export function observeMessageIdentity(
	webhookId: string,
	author: ExternalAuthor,
	createdAt: string
): void {
	if (author.source !== 'webhook' || author.id !== webhookId || !author.name) return;

	const current = state.identities.get(webhookId);
	if (current?.source === 'management' || (current && current.observedAt >= createdAt)) return;

	state.identities.set(webhookId, {
		name: author.name,
		display_name: null,
		source: 'message',
		observedAt: createdAt
	});
}

export function displayName(webhookId: string, fallback = 'Webhook'): string {
	const managed = state.byId.get(webhookId);
	if (managed) return managed.display_name || managed.name || fallback;

	const identity = state.identities.get(webhookId);
	return identity?.display_name || identity?.name || fallback;
}

function rememberManagedIdentity(webhook: Webhook): void {
	state.identities.set(webhook.id, {
		name: webhook.name,
		display_name: webhook.display_name,
		source: 'management',
		observedAt: ''
	});
}

export function reset(): void {
	state.byId = new SvelteMap<string, Webhook>();
	state.identities = new SvelteMap<string, WebhookDisplayIdentity>();
	state.list = [];
	state.loaded = false;
	state.loading = false;
}

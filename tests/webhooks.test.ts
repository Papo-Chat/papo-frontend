// Vitest on webhook helpers: avatar URL builders (host-agnostic, same style
// as the api query-serialization tests) + external avatar resolution.

import { afterEach, describe, it, expect } from 'vitest';
import * as webhooksStore from '../src/lib/store/webhooks.svelte';
import { webhookAvatarUrl, resolveExternalAvatarUrl } from '../src/lib/utils/media';
import { messageAuthorIdentity } from '../src/lib/utils/message-author';

describe('webhookAvatarUrl', () => {
	it('builds the public avatar endpoint path', () => {
		// Host-agnostic: assert the tail regardless of PUBLIC_API_URL.
		expect(webhookAvatarUrl('w1')).toMatch(/\/webhooks\/w1\/avatar$/);
	});

	it('encodes the webhook id', () => {
		expect(webhookAvatarUrl('a/b')).toMatch(/\/webhooks\/a%2Fb\/avatar$/);
	});
});

describe('resolveExternalAvatarUrl', () => {
	it('resolves backend-relative paths against the API base', () => {
		// Avatar persistente do webhook chega como caminho relativo.
		const resolved = resolveExternalAvatarUrl('/webhooks/w1/avatar');
		expect(resolved).toMatch(/\/webhooks\/w1\/avatar$/);
	});

	it('passes absolute external URLs through untouched (CDN de origem)', () => {
		const url = 'https://cdn.example.com/avatars/bot.png';
		expect(resolveExternalAvatarUrl(url)).toBe(url);
	});
});

describe('webhook display identity', () => {
	afterEach(() => webhooksStore.reset());

	it('uses the newest persistent-identity snapshot from loaded messages', () => {
		webhooksStore.observeMessageIdentity(
			'w1',
			{ source: 'webhook', id: 'w1', name: 'Nome inicial' },
			'2026-10-14T10:00:00Z'
		);
		webhooksStore.observeMessageIdentity(
			'w1',
			{ source: 'webhook', id: 'w1', name: 'Nome novo' },
			'2026-10-14T11:00:00Z'
		);
		// A late historical page must not replace the freshest nickname.
		webhooksStore.observeMessageIdentity(
			'w1',
			{ source: 'webhook', id: 'w1', name: 'Nome antigo' },
			'2026-10-14T09:00:00Z'
		);

		expect(webhooksStore.displayName('w1')).toBe('Nome novo');
	});

	it('does not treat per-message external aliases as the webhook identity', () => {
		webhooksStore.observeMessageIdentity(
			'w1',
			{ source: 'discord', id: 'external-1', name: 'Alias temporário' },
			'2026-10-14T11:00:00Z'
		);

		expect(webhooksStore.displayName('w1')).toBe('Webhook');
	});

	it('prefers the current management identity when available', () => {
		webhooksStore.observeMessageIdentity(
			'w1',
			{ source: 'webhook', id: 'w1', name: 'Nome antigo' },
			'2026-10-14T10:00:00Z'
		);
		webhooksStore.state.byId.set('w1', {
			id: 'w1',
			channel_id: 'c1',
			name: 'Nome base',
			display_name: 'Nickname atual',
			created_by: 'u1',
			created_at: '2026-10-14T09:00:00Z'
		});

		expect(webhooksStore.displayName('w1')).toBe('Nickname atual');
	});
});

// Autoria de exibição nas superfícies fora do chat (pins, busca, notificações,
// prévia de resposta): mensagens de webhook têm author_id null, então nome e
// avatar precisam vir de external_author/webhooksStore.
describe('messageAuthorIdentity', () => {
	afterEach(() => webhooksStore.reset());

	const userSummary = {
		id: 'u1',
		username: 'joao',
		nickname: 'João',
		status: null,
		status_message: null,
		typing: null,
		status_updated_at: null,
		created_at: '2026-10-14T09:00:00Z',
		roles: []
	};

	it('resolves a human message from the user summary', () => {
		const identity = messageAuthorIdentity(
			{ id: 'm1', author_id: 'u1', webhook_id: null, external_author: null },
			userSummary
		);

		expect(identity.isWebhook).toBe(false);
		expect(identity.userId).toBe('u1');
		expect(identity.name).toBe('João');
		expect(identity.avatarUrl).toBeNull();
	});

	it('falls back to the listing name while the author is still loading', () => {
		const identity = messageAuthorIdentity(
			{ id: 'm1', author_id: 'u1', webhook_id: null, external_author: null },
			undefined,
			'joao'
		);

		expect(identity.user).toBeNull();
		expect(identity.name).toBe('joao');
	});

	it('uses the persistent webhook identity name and its avatar', () => {
		webhooksStore.observeMessageIdentity(
			'w1',
			{ source: 'webhook', id: 'w1', name: 'Robô novo' },
			'2026-10-14T11:00:00Z'
		);

		const identity = messageAuthorIdentity({
			id: 'm1',
			author_id: null,
			webhook_id: 'w1',
			external_author: { source: 'webhook', id: 'w1', name: 'Robô antigo', avatar_url: '/webhooks/w1/avatar' }
		});

		expect(identity.isWebhook).toBe(true);
		expect(identity.userId).toBeNull();
		expect(identity.name).toBe('Robô novo');
		expect(identity.avatarUrl).toBe('/webhooks/w1/avatar');
	});

	it('keeps a per-message external alias untouched', () => {
		webhooksStore.observeMessageIdentity(
			'w1',
			{ source: 'webhook', id: 'w1', name: 'Nome do webhook' },
			'2026-10-14T12:00:00Z'
		);

		const identity = messageAuthorIdentity({
			id: 'm1',
			author_id: null,
			webhook_id: 'w1',
			external_author: { source: 'discord', id: 'ext-1', name: 'Autor do Discord' }
		});

		expect(identity.name).toBe('Autor do Discord');
		expect(identity.avatarUrl).toBeNull();
	});

	it('degrades to the webhook icon when the snapshot is missing', () => {
		const identity = messageAuthorIdentity({
			id: 'm1',
			author_id: null,
			webhook_id: 'w1',
			external_author: null
		});

		expect(identity.isWebhook).toBe(true);
		expect(identity.name).toBe('Webhook');
		expect(identity.avatarUrl).toBeNull();
	});
});

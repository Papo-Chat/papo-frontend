// Vitest on webhook helpers: avatar URL builders (host-agnostic, same style
// as the api query-serialization tests) + external avatar resolution.

import { afterEach, describe, it, expect } from 'vitest';
import * as webhooksStore from '../src/lib/store/webhooks.svelte';
import { webhookAvatarUrl, resolveExternalAvatarUrl } from '../src/lib/utils/media';

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

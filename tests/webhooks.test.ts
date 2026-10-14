// Vitest on webhook helpers: avatar URL builders (host-agnostic, same style
// as the api query-serialization tests) + external avatar resolution.

import { describe, it, expect } from 'vitest';
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

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import type { IncomingMessage } from 'http';

// Dev: all API prefixes are proxied to the Go backend so the browser sees a
// same-origin API (HttpOnly auth cookie, zero CORS). See plan §10.
//
// Page requests (browser full navigations / SvelteKit client-side navigation)
// must be served by SvelteKit, NOT proxied — routes that sit under API
// prefixes (/channels, /channels/:id, /users/:id, /auth, /auth/register, /admin
// ...) are SvelteKit pages, not API endpoints. A `bypass` function hands them
// back to SvelteKit. Only real API calls (Accept: application/problem+json |
// application/json from api.ts, binary fetches with Accept: */*, and WS
// upgrades) are proxied to the Go backend.
//
// DEMO=1 disables the proxy so the frontend pages under /channels, /users,
// /auth, /admin etc. are served by SvelteKit directly (sample data, no
// backend required) — useful for visual review without the Go service up.
const demoMode = process.env.DEMO === '1';
const backend = process.env.PAPO_BACKEND ?? 'http://localhost:8080';

const apiPrefixes = [
	'/auth',
	'/users',
	'/server',
	'/channels',
	'/dms',
	'/messages',
	'/roles',
	'/emojis',
	'/attachments',
	'/media',
	'/embeds',
	'/link-previews',
	'/search',
	'/admin',
	'/voice',
	'/health',
	'/ws'
];

// A request is a *page* request (SvelteKit must serve it) when:
//  - the browser did a full navigation (Accept: text/html, ...), or
//  - SvelteKit's client-side navigation (x-sveltekit-page header).
// API calls (api.ts) send Accept: application/problem+json, application/json;
// binary fetches (fetchBlob) send Accept: */*; WS upgrades send Upgrade: ws.
// None of those are page requests.
// Vite types `bypass`'s `req` as `http.IncomingMessage`, but at runtime it
// passes an `IncomingRequest` (which carries `url`). Cast to it to read the
// request path.
function headerText(req: IncomingMessage, name: string): string {
	const v = req.headers[name];
	if (typeof v === 'string') return v;
	if (Array.isArray(v)) return v[0] ?? '';
	return '';
}

const isPageRequest = (req: IncomingMessage): boolean => {
	// Never bypass a WebSocket upgrade — it must reach the Go backend.
	if (headerText(req, 'upgrade').trim().toLowerCase() === 'websocket') {
		return false;
	}
	const accept = headerText(req, 'accept').trimStart().toLowerCase();
	const isHtml = accept.startsWith('text/html');
	const isKitPage = req.headers['x-sveltekit-page'] != null;
	return isHtml || isKitPage;
};

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		proxy: demoMode
			? {}
			: Object.fromEntries(
					apiPrefixes.map((prefix) => [
						prefix,
						{
							target: backend,
							changeOrigin: true,
							ws: prefix === '/ws',
							// Page requests fall through to SvelteKit; only real
							// API requests are proxied to the Go backend.
							bypass: async (req: IncomingMessage) => {
								// Vite types `req` as `IncomingMessage` but at
								// runtime passes a request that carries `url`;
								// minimal structural cast to read the path.
								const url = (req as { url?: string }).url;
								return isPageRequest(req) ? (url ?? undefined) : undefined;
							}
						}
					])
				)
	},
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node'
	}
});

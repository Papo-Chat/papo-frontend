import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// Dev: all API prefixes are proxied to the Go backend so the browser sees a
// same-origin API (HttpOnly auth cookie, zero CORS). See plan §10.
const backend = 'http://localhost:8080';

const apiPrefixes = [
	'/auth',
	'/users',
	'/server',
	'/channels',
	'/messages',
	'/roles',
	'/emojis',
	'/attachments',
	'/media',
	'/link-previews',
	'/search',
	'/admin',
	'/voice',
	'/health',
	'/ws'
];

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		proxy: Object.fromEntries(
			apiPrefixes.map((prefix) => [
				prefix,
				{ target: backend, changeOrigin: true, ws: prefix === '/ws' }
			])
		)
	},
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node'
	}
});

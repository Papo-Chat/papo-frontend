import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Self-hosted SPA: nginx serves the static build; the fallback SPA
	// index.html handles client-side routes. adapter-static always
	// produces a static build (SvelteKit 2.x has no `ssr` option; the
	// build type is decided by the adapter).
	kit: {
		adapter: adapter({ fallback: 'index.html' })
	}
};

export default config;

// Public env vars read via SvelteKit's `$env/dynamic/public`
// (the `$env` form, preferred over `import.meta.env.PUBLIC_*`).
// Empty string when the var is unset.
import { env } from '$env/dynamic/public';

export const PUBLIC_API_URL: string = (env.PUBLIC_API_URL ?? '') as string;
export const PUBLIC_WS_URL: string = (env.PUBLIC_WS_URL ?? '') as string;

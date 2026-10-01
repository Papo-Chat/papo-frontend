// Public env vars read via SvelteKit's `$env/dynamic/public`
// (the `$env` form, preferred over `import.meta.env.PUBLIC_*`).
// Empty string when the var is unset.
import { env } from '$env/dynamic/public';

export const PUBLIC_API_URL: string = (env.PUBLIC_API_URL ?? '') as string;
export const PUBLIC_WS_URL: string = (env.PUBLIC_WS_URL ?? '') as string;
export const PUBLIC_GIPHY_API_KEY: string = (env.PUBLIC_GIPHY_API_KEY ?? '') as string;


function publicInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// Must match VOICE_VIDEO_SLOTS / VOICE_AUDIO_SLOTS on the backend.
export const PUBLIC_VOICE_VIDEO_SLOTS = publicInt(env.PUBLIC_VOICE_VIDEO_SLOTS, 6);
export const PUBLIC_VOICE_AUDIO_SLOTS = publicInt(env.PUBLIC_VOICE_AUDIO_SLOTS, 8);

// Deterministic avatar helpers: initial letter + color gradient derived from
// the username hash. Shared by Avatar.svelte and ProfileCard.svelte so every
// user renders with the same color/initial across the app.

export const AVATAR_GRADIENTS = [
	'linear-gradient(145deg, #94553f, #e9ad87)',
	'linear-gradient(145deg, #0f7258, #69d39c)',
	'linear-gradient(145deg, #67347f, #cd74d0)',
	'linear-gradient(145deg, #167dc7, #65c8e2)'
];

export function hash(str: string): number {
	let h = 0;
	for (let i = 0; i < str.length; i++) {
		h = (h * 31 + str.charCodeAt(i)) | 0;
	}
	return Math.abs(h);
}

export function avatarInitial(
	username: string,
	nickname: string | null
): string {
	return (nickname || username || 'U').charAt(0).toUpperCase();
}

export function avatarGradient(username: string): string {
	return AVATAR_GRADIENTS[hash(username) % AVATAR_GRADIENTS.length];
}

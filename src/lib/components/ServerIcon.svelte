<script lang="ts">
	// Server icon (API `icon_blob` base64). Renders the image when present,
	// otherwise falls back to the first letter of the server name. The icon
	// always fills its parent (which provides the size, background and radius).
	import { avatarInitial } from '$lib/utils/avatars';
	import { blobToUrl } from '$lib/utils/media';

	let {
		iconBlob = '',
		iconFormat = '',
		name = 'Servidor',
		size = 34,
		dark = false
	} = $props<{
		iconBlob?: string | null;
		iconFormat?: string | null;
		name?: string;
		size?: number;
		/** Fallback letter color: white on dark/blue backgrounds, blue on light. */
		dark?: boolean;
	}>();

	const iconUrl = $derived(blobToUrl(iconBlob ?? '', iconFormat ?? ''));
	const initial = $derived(avatarInitial(name, null));
	const fallbackColor = $derived(dark ? '#ffffff' : 'rgba(8, 119, 204, 0.9)');
</script>

<div class="server-icon">
	{#if iconUrl}
		<img src={iconUrl} alt={name} aria-hidden="true" />
	{:else}
		<span
			class="server-icon-fallback"
			style="font-size:{size * 0.5}px; color:{fallbackColor}"
			aria-hidden="true">{initial}</span
		>
	{/if}
</div>

<style>
	.server-icon {
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
	}
	.server-icon img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.server-icon-fallback {
		font-weight: 800;
		line-height: 1;
		display: block;
	}
</style>

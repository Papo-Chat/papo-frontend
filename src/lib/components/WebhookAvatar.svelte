<script lang="ts">
	// Avatar de webhook: imagem servida por GET /webhooks/:id/avatar (avatar
	// persistente) ou avatar_url externo do external_author. Webhook não é
	// usuário: nunca abre perfil, então o elemento é sempre um span estático.
	// Sem avatar persistente o endpoint devolve 404 — cai no ícone fallback.

	import { resolveExternalAvatarUrl } from '$lib/utils/media';
	import Icon from './Icon.svelte';

	let {
		avatarUrl = null,
		size = 39,
		ariaLabel = 'Webhook'
	} = $props<{
		avatarUrl?: string | null;
		size?: number;
		ariaLabel?: string;
	}>();

	const src = $derived(avatarUrl ? resolveExternalAvatarUrl(avatarUrl) : '');
	// URL que falhou ao carregar (404/erro de rede). Compara com src para que
	// uma nova URL (ex.: avatar recém-carregado) volte a tentar a imagem.
	let failedSrc = $state('');
	const showImage = $derived(!!src && src !== failedSrc);
	const iconSize = $derived(size * 0.5);
	const ringStyle = $derived(`width:${size}px;height:${size}px;font-size:${iconSize}px`);

	function onError(): void {
		failedSrc = src;
	}
</script>

<span class="avatar webhook-avatar" style={ringStyle} aria-label={ariaLabel}>
	{#if showImage}
		<img class="avatar-image" src={src} alt="" onerror={onError} />
	{:else}
		<Icon name="webhook" variant="duotone" size={iconSize} />
	{/if}
</span>

<style>
	.webhook-avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border-radius: 50%;
		overflow: hidden;
		box-sizing: border-box;
		border: 2px solid rgba(255, 255, 255, 0.84);
		background: linear-gradient(135deg, #1c7ed6, #22b8cf);
		color: #fff;
	}

	.avatar-image {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: cover;
		image-rendering: auto;
	}
</style>

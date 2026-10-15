<script lang="ts">
	// Webhook avatars stay lightweight. The optional action makes only clickable
	// instances keyboard-accessible buttons; passive avatars remain spans.
	import { resolveExternalAvatarUrl } from '$lib/utils/media';
	import Icon from './Icon.svelte';

	let {
		avatarUrl = null,
		size = 39,
		ariaLabel = 'Webhook',
		onClick = null
	} = $props<{
		avatarUrl?: string | null;
		size?: number;
		ariaLabel?: string;
		onClick?: (() => void) | null;
	}>();

	const src = $derived(avatarUrl ? resolveExternalAvatarUrl(avatarUrl) : '');
	let failedSrc = $state('');
	const showImage = $derived(!!src && src !== failedSrc);
	const iconSize = $derived(size * 0.5);
	const ringStyle = $derived(`width:${size}px;height:${size}px;font-size:${iconSize}px`);

	function onError(): void {
		failedSrc = src;
	}
</script>

{#snippet content()}
	{#if showImage}
		<img class="avatar-image" src={src} alt="" onerror={onError} />
	{:else}
		<Icon name="webhook" variant="duotone" size={iconSize} />
	{/if}
{/snippet}

{#if onClick}
	<button
		type="button"
		class="avatar webhook-avatar"
		style={ringStyle}
		aria-label={ariaLabel}
		onclick={onClick}
	>
		{@render content()}
	</button>
{:else}
	<span class="avatar webhook-avatar" style={ringStyle} aria-label={ariaLabel}>
		{@render content()}
	</span>
{/if}

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
		transition:
			transform 0.18s var(--ease),
			box-shadow 0.18s var(--ease);
	}

	button.webhook-avatar {
		cursor: pointer;
		margin: 0;
		padding: 0;
	}

	button.webhook-avatar:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 18px rgba(17, 58, 86, 0.22);
	}

	button.webhook-avatar:active {
		transform: scale(0.96);
	}

	.avatar-image {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: cover;
		image-rendering: auto;
	}

	@media (prefers-reduced-motion: reduce) {
		.webhook-avatar {
			transition: none;
		}
	}
</style>

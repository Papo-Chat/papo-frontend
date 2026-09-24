<script lang="ts">
	import { avatarGradient, avatarInitial } from '$lib/utils/avatars';
	import Icon from './Icon.svelte';

	let {
		username,
		nickname = null,
		icon = '',
		size = 39,
		onClick = null,
		ariaLabel = null
	} = $props<{
		username: string;
		nickname?: string | null;
		icon?: string;
		size?: number;
		onClick?: () => void;
		ariaLabel?: string | null;
	}>();

	const gradient = $derived(avatarGradient(username));
	const initial = $derived(avatarInitial(username, nickname));
	const iconSize = $derived(size * 0.5);
</script>

{#if onClick}
	<button
		class="avatar"
		aria-label={ariaLabel ?? undefined}
		style="width:{size}px;height:{size}px;font-size:{iconSize}px;background:{gradient}"
		onclick={onClick}
	>
		{#if icon}<Icon name={icon} variant="duotone" size={iconSize} />{:else}{initial}{/if}
	</button>
{:else}
	<span
		class="avatar"
		style="width:{size}px;height:{size}px;font-size:{iconSize}px;background:{gradient}"
	>
		{#if icon}<Icon name={icon} variant="duotone" size={iconSize} />{:else}{initial}{/if}
	</span>
{/if}

<style>
	button.avatar {
		border: 2px solid rgba(255, 255, 255, 0.84);
		cursor: pointer;
		margin: 0;
		padding: 0;
		transition:
			transform 0.18s var(--ease),
			box-shadow 0.18s var(--ease);
	}
	button.avatar:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 18px rgba(17, 58, 86, 0.22);
	}
	button.avatar:active {
		transform: scale(0.96);
	}
	.avatar i {
		line-height: 1;
	}
</style>

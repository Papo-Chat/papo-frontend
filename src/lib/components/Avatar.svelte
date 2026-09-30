<script lang="ts">
	import type { RoleSummary, UserSummary } from '$lib/types';
	import { blobToUrl } from '$lib/utils/media';
	import { avatarGradient, avatarInitial } from '$lib/utils/avatars';
	import * as usersStore from '$lib/store/users.svelte';
	import Icon from './Icon.svelte';

	let {
		user = null,
		userId = null,
		icon = '',
		size = 39,
		onClick = null,
		ariaLabel = null,
		ringColor = null
	} = $props<{
		user?: UserSummary | null;
		userId?: string | null;
		icon?: string;
		size?: number;
		onClick?: () => void;
		ariaLabel?: string | null;
		ringColor?: string | null;
	}>();

	const effectiveUserId = $derived(user?.id ?? userId ?? null);
	const profile = $derived(effectiveUserId ? usersStore.getProfile(effectiveUserId) : null);

	const name = $derived(profile?.nickname || user?.nickname || user?.username || 'Usuário');

	const gradient = $derived(user ? avatarGradient(user.username) : avatarGradient(effectiveUserId ?? 'U'));

	const initial = $derived(
		user ? avatarInitial(user.username, profile?.nickname ?? user.nickname) : 'U'
	);

	const avatarSrc = $derived(
		profile?.avatar_blob ? blobToUrl(profile.avatar_blob, profile.avatar_format) : ''
	);

	const iconSize = $derived(size * 0.5);

	// Anel global: cor da primeira role com cor do usuário.
	// A prop `ringColor` (se passada) sobrepondo a cor derivada.
	const roleRing = $derived(
		user ? (user.roles.find((r: RoleSummary) => r.color)?.color ?? null) : null
	);
	const ring = $derived(ringColor ?? roleRing);

	const ringStyle = $derived(
		[
			`width:${size}px`,
			`height:${size}px`,
			`font-size:${iconSize}px`,
			`background:${gradient}`,
			ring ? `border:2px solid ${ring}` : ''
		]
			.filter(Boolean)
			.join(';')
	);

	let avatarEl: HTMLElement | null = $state(null);

	// Keep heavy profiles hot only for avatars that are visible or close to
	// becoming visible. The store keeps released profiles in a bounded LRU.
	$effect(() => {
		const id = effectiveUserId;
		const el = avatarEl;

		if (!id || !el) return;

		let retained = false;
		const setRetained = (next: boolean) => {
			if (next === retained) return;
			retained = next;
			if (next) usersStore.retainProfile(id);
			else usersStore.releaseProfile(id);
		};

		if (typeof IntersectionObserver === 'undefined') {
			setRetained(true);
			return () => setRetained(false);
		}

		const observer = new IntersectionObserver(
			(entries) => {
				setRetained(entries.some((entry) => entry.isIntersecting));
			},
			{ rootMargin: '300px 0px' }
		);

		observer.observe(el);

		return () => {
			observer.disconnect();
			setRetained(false);
		};
	});
</script>

{#snippet content()}
	{#if avatarSrc}
		<img class="avatar-image" src={avatarSrc} alt={name} />
	{:else if icon}
		<Icon name={icon} variant="duotone" size={iconSize} />
	{:else}
		<span class="avatar-initial">{initial}</span>
	{/if}
{/snippet}

{#if onClick}
	<button
		bind:this={avatarEl}
		type="button"
		class="avatar"
		aria-label={ariaLabel ?? `Abrir perfil de ${name}`}
		style={ringStyle}
		onclick={onClick}
	>
		{@render content()}
	</button>
{:else}
	<span bind:this={avatarEl} class="avatar" style={ringStyle}>
		{@render content()}
	</span>
{/if}

<style>
	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border-radius: 50%;
		overflow: hidden;
		box-sizing: border-box;
		font-weight: 600;
		line-height: 1;
	}

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

	.avatar-image {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: cover;
	}

	.avatar-initial {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	.avatar :global(i) {
		line-height: 1;
	}
</style>

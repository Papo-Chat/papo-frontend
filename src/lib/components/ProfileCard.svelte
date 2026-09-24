<script lang="ts">
	// User profile card — a Liquid Glass overlay that floats over the
	// interface (like the mobile drawers), showing banner, avatar, roles and
	// description. Follows the same glass language as the popovers.
	import type { UserProfile } from '$lib/types';
	import { blobToUrl, mediaUrl } from '$lib/utils/media';
	import { avatarGradient as utilAvatarGradient, avatarInitial, hash } from '$lib/utils/avatars';

	let {
		user,
		open = $bindable(false),
		onOpenChange = () => {}
	} = $props<{
		user: UserProfile;
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
	}>();

	let cardEl: HTMLElement | null = null;

	// Deterministic fallbacks (the mockup ships no real binary assets).
	const bannerGradients = [
		'linear-gradient(120deg, #0a84ff, #5ac8fa, #30d158)',
		'linear-gradient(120deg, #67347f, #9b5de5, #5ac8fa)',
		'linear-gradient(120deg, #0f7258, #5ac8fa, #0a84ff)',
		'linear-gradient(120deg, #e7a80b, #30d158, #0a84ff)'
	];

	const statusLabels: Record<'online' | 'away' | 'busy', string> = {
		online: 'Online',
		away: 'Ausente',
		busy: 'Em ocupação'
	};
	const name = $derived(user.nickname || user.username || 'Usuário');
	const initial = $derived(avatarInitial(user.username, user.nickname));
	const avatarSrc = $derived(
		user.avatar_blob ? blobToUrl(user.avatar_blob, user.avatar_format) : ''
	);
	const bannerSrc = $derived(user.banner_media ? mediaUrl(user.banner_media) : '');
	const avatarGradient = $derived(utilAvatarGradient(user.username));
	const bannerGradient = $derived(bannerGradients[hash(name) % bannerGradients.length]);
	const statusClass = $derived<'online' | 'away' | 'busy'>(
		user.status === null ? 'online' : user.status
	);
	const statusLabel = $derived(statusLabels[statusClass]);

	function close(): void {
		if (open) {
			open = false;
			onOpenChange(false);
		}
	}

	// Close on outside click + Escape. Listeners only exist while open.
	$effect(() => {
		if (!open) return;

		function onPointerDown(e: PointerEvent): void {
			if (cardEl && !cardEl.contains(e.target as Node)) {
				close();
			}
		}

		function onKeyDown(e: KeyboardEvent): void {
			if (e.key === 'Escape') close();
		}

		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);

		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	});
</script>

{#if open}
	<div class="profile-overlay open" role="presentation">
		<div class="profile-card open" role="dialog" aria-label="Perfil de {name}" bind:this={cardEl}>
			<button class="profile-close" onclick={close} aria-label="Fechar perfil">
				<i class="ph-light ph-x" aria-hidden="true"></i>
			</button>

			<div class="profile-banner" style="background: {bannerGradient}">
				{#if bannerSrc}
					<img class="profile-banner-img" src={bannerSrc} alt="" />
				{/if}
			</div>

			<div class="profile-avatar" style="background: {avatarGradient}">
				{#if avatarSrc}
					<img class="profile-avatar-img" src={avatarSrc} alt={name} />
				{:else}
					<span class="profile-avatar-initial">{initial}</span>
				{/if}
				<span class="profile-status-dot {statusClass}" aria-label="Status: {statusLabel}"></span>
			</div>

			<div class="profile-name-block">
				<div class="profile-name-row">
					<strong class="profile-name">{name}</strong>
					<span class="profile-username">@{user.username}</span>
					{#if user.status_message}
						<span class="profile-status-text {statusClass}">{user.status_message}</span>
					{/if}
				</div>
			</div>

			{#if user.roles.length}
				<div class="profile-roles">
					{#each user.roles as role}
						<span
							class="profile-role"
							style="color: {role.color ?? '#8493a0'}; border-color: {role.color}"
						>
							{role.name}
						</span>
					{/each}
				</div>
			{/if}

			<div class="profile-divider" />

			{#if user.description}
				<p class="profile-bio">{user.description}</p>
			{:else}
				<p class="profile-bio profile-bio-empty">Sem descrição.</p>
			{/if}
		</div>
	</div>
{/if}

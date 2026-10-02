<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	// User profile card — a Liquid Glass overlay that floats over the
	// interface (like the mobile drawers), showing banner, avatar, roles and
	// description. Follows the same glass language as the popovers.
	import type { RoleSummary, UserSummary } from '$lib/types';
	import { mediaUrl } from '$lib/utils/media';
	import * as usersStore from '$lib/store/users.svelte';
	import * as dmsStore from '$lib/store/dms.svelte';
	import * as blocksStore from '$lib/store/blocks.svelte';
	import * as channelsStore from '$lib/store/channels.svelte';
	import { meId } from '$lib/store/session.svelte';
	import { hash } from '$lib/utils/avatars';
	import Avatar from './Avatar.svelte';

	let {
		user,
		open = $bindable(false),
		onOpenChange = () => {}
	} = $props<{
		user: UserSummary;
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
	}>();

	const profile = $derived(user ? usersStore.getProfile(user.id) : null);
	const roleColor = $derived(user.roles.find((r: RoleSummary) => r.color)?.color ?? null);

	let cardEl: HTMLElement | null = null;
	let loadingProfile: string | null = $state(null);
	let actionBusy = $state(false);
	let actionError: string | null = $state(null);

	const isMe = $derived(user.id === meId());
	const blocked = $derived(blocksStore.isBlocked(user.id));

	// Perfil real (avatar/banner) só existe na cache de perfis. Se ainda não
	// foi carregado (ex.: o próprio usuário, resumido via seedMe), carrega
	// uma única vez.
	$effect(() => {
		const id = user.id;
		if (!usersStore.getProfile(id) && loadingProfile !== id) {
			loadingProfile = id;
			void usersStore.ensureProfile(id).finally(() => {
				loadingProfile = null;
			});
		}
	});

	// Deterministic fallbacks (the mockup ships no real binary assets).
	const bannerGradients = [
		'linear-gradient(120deg, #0a84ff, #5ac8fa, #30d158)',
		'linear-gradient(120deg, #67347f, #9b5de5, #5ac8fa)',
		'linear-gradient(120deg, #0f7258, #5ac8fa, #0a84ff)',
		'linear-gradient(120deg, #e7a80b, #30d158, #0a84ff)'
	];

	const statusLabels: Record<'online' | 'away' | 'busy' | 'offline', string> = {
		online: 'Online',
		away: 'Ausente',
		busy: 'Ocupado',
		offline: 'Offline'
	};
	const name = $derived(user.nickname || user.username || 'Usuário');

	const bannerSrc = $derived(profile?.banner_media ? mediaUrl(profile.banner_media) : '');
	const bannerGradient = $derived(bannerGradients[hash(name) % bannerGradients.length]);
	const statusClass = $derived<'online' | 'away' | 'busy' | 'offline'>(
		usersStore.effectiveStatus(user.id)
	);
	const statusLabel = $derived(statusLabels[statusClass]);

	function close(): void {
		if (open) {
			open = false;
			onOpenChange(false);
		}
	}

	function homePath(): string {
		const home = channelsStore.homeChannel();
		return home ? `/channels/${home.id}` : '/';
	}

	async function startDm(): Promise<void> {
		if (actionBusy || blocked || isMe) return;
		actionBusy = true;
		actionError = null;
		try {
			const dm = await dmsStore.openWithUser(user.id);
			close();
			await goto(`/dm/${dm.id}`);
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Não foi possível abrir a conversa.';
		} finally {
			actionBusy = false;
		}
	}

	async function toggleBlock(): Promise<void> {
		if (actionBusy || isMe) return;
		actionBusy = true;
		actionError = null;
		const dm = dmsStore.findByUser(user.id);
		try {
			if (blocked) {
				await blocksStore.unblock(user.id);
			} else {
				await blocksStore.block(user);
				if (dm && page.url.pathname === `/dm/${dm.id}`) {
					close();
					await goto(homePath());
				}
			}
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Não foi possível atualizar o bloqueio.';
		} finally {
			actionBusy = false;
		}
	}

	// Close on outside click + Escape. Listeners only exist while open.
	$effect(() => {
		if (open && !blocksStore.state.loaded && !blocksStore.state.loading) {
			void blocksStore.load().catch(() => {});
		}
	});

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

			<div class="profile-avatar">
				<Avatar {user} size={90} />
				<span class="profile-status-dot {statusClass}" aria-label="Status: {statusLabel}"></span>
			</div>

			<div class="profile-name-block">
				<div class="profile-name-row">
					<strong class="profile-name" style={roleColor ? `color:${roleColor}` : undefined}
						>{name}</strong
					>
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

			{#if profile?.description}
				<p class="profile-bio">{profile.description}</p>
			{:else}
				<p class="profile-bio profile-bio-empty">Sem descrição.</p>
			{/if}

			{#if !isMe}
				<div class="profile-actions">
					<button
						class="profile-action primary"
						type="button"
						disabled={actionBusy || blocked}
						onclick={() => void startDm()}
					>
						<i class="ph-light ph-chat-circle-text" aria-hidden="true"></i>
						Mensagem
					</button>
					<button
						class="profile-action danger"
						class:blocked
						type="button"
						disabled={actionBusy}
						onclick={() => void toggleBlock()}
					>
						<i class={blocked ? 'ph-light ph-user-plus' : 'ph-light ph-user-minus'} aria-hidden="true"></i>
						{blocked ? 'Desbloquear' : 'Bloquear'}
					</button>
				</div>
				{#if actionError}
					<p class="profile-action-error" role="alert">{actionError}</p>
				{/if}
			{/if}
		</div>
	</div>
{/if}


<style>
	.profile-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		padding: 0 16px 16px;
	}

	.profile-action {
		min-height: 36px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border-radius: 11px;
		border: 1px solid var(--border);
		background: rgba(255, 255, 255, 0.34);
		color: var(--text);
		font: inherit;
		font-size: 11px;
		font-weight: 750;
		cursor: pointer;
	}

	.profile-action.primary {
		border-color: color-mix(in srgb, var(--accent) 30%, transparent);
		color: var(--accent);
	}

	.profile-action.danger {
		color: #c74356;
		border-color: rgba(205, 67, 86, 0.2);
	}

	.profile-action.danger.blocked {
		color: var(--text);
	}

	.profile-action:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.profile-action-error {
		margin: -8px 16px 14px;
		font-size: 10px;
		color: #c74356;
	}

	:global([data-theme='dark']) .profile-action {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(181, 222, 248, 0.14);
	}

	:global([data-theme='dark']) .profile-action.danger {
		color: #ff8d9d;
		border-color: rgba(255, 110, 130, 0.18);
	}

	:global(html[data-ui-flat]) .profile-action {
		box-shadow: none;
	}

	@media (max-width: 430px) {
		.profile-actions {
			grid-template-columns: 1fr;
		}
	}
</style>

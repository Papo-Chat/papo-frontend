<script lang="ts">
	import { closeProfile } from '$lib/store/ui.svelte';
	import * as webhooksStore from '$lib/store/webhooks.svelte';
	import WebhookAvatar from './WebhookAvatar.svelte';

	let {
		webhookId,
		fallbackName,
		avatarUrl = null,
		profileUrl = null,
		usePersistentIdentity = false,
		open = $bindable(false),
		onOpenChange = () => {}
	} = $props<{
		webhookId: string;
		fallbackName: string;
		avatarUrl?: string | null;
		profileUrl?: string | null;
		usePersistentIdentity?: boolean;
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
	}>();

	const name = $derived(
		usePersistentIdentity ? webhooksStore.displayName(webhookId, fallbackName) : fallbackName
	);
	const safeProfileUrl = $derived(isSafeExternalUrl(profileUrl) ? profileUrl : '');
	let cardEl: HTMLElement | null = null;

	function isSafeExternalUrl(value: string | null | undefined): value is string {
		if (!value) return false;
		try {
			const url = new URL(value);
			return url.protocol === 'https:' || url.protocol === 'http:';
		} catch {
			return false;
		}
	}

	function close(): void {
		if (!open) return;
		open = false;
		onOpenChange(false);
		closeProfile();
	}

	// Global listeners exist only while the single shared card is open.
	$effect(() => {
		if (!open) return;

		function onPointerDown(event: PointerEvent): void {
			if (cardEl && !cardEl.contains(event.target as Node)) close();
		}
		function onKeyDown(event: KeyboardEvent): void {
			if (event.key === 'Escape') close();
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
		<section
			class="profile-card open webhook-profile-card"
			role="dialog"
			aria-modal="true"
			aria-label="Aplicativo {name}"
			bind:this={cardEl}
		>
			<button class="profile-close" type="button" onclick={close} aria-label="Fechar perfil">
				<i class="ph-light ph-x" aria-hidden="true"></i>
			</button>

			<div class="profile-banner webhook-profile-banner"></div>

			<div class="profile-avatar">
				<WebhookAvatar {avatarUrl} size={90} ariaLabel={`Avatar de ${name}`} />
			</div>

			<div class="profile-name-block">
				<div class="profile-name-row webhook-profile-name-row">
					<strong class="profile-name">{name}</strong>
					<span class="webhook-app-pill">APP</span>
				</div>
				<span class="webhook-profile-kind">Aplicativo / Webhook</span>
			</div>

			<div class="profile-divider"></div>
			<p class="profile-bio webhook-profile-description">
				Esta identidade envia mensagens por integração. Não é uma conta de usuário do Papo.
			</p>

			{#if safeProfileUrl}
				<div class="webhook-profile-actions">
					<a
						class="profile-action primary"
						href={safeProfileUrl}
						target="_blank"
						rel="noopener noreferrer"
					>
						<i class="ph-light ph-arrow-square-out" aria-hidden="true"></i>
						Abrir perfil externo
					</a>
				</div>
			{/if}
		</section>
	</div>
{/if}

<style>
	.webhook-profile-banner {
		background: linear-gradient(120deg, #155fa0, #22b8cf, #673ab7);
	}

	.webhook-profile-name-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		min-width: 0;
	}

	.webhook-app-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		padding: 2px 6px;
		border: 1px solid rgba(31, 126, 190, 0.34);
		border-radius: 5px;
		background: rgba(10, 126, 204, 0.12);
		color: var(--accent, #1687d9);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.045em;
		line-height: 1.2;
	}

	.webhook-profile-kind {
		display: block;
		margin-top: 4px;
		color: var(--muted);
		font-size: 12px;
	}

	.webhook-profile-description {
		margin-top: 0;
		line-height: 1.5;
	}

	.webhook-profile-actions {
		padding: 0 16px 16px;
	}

	.webhook-profile-actions .profile-action {
		width: 100%;
		box-sizing: border-box;
		text-decoration: none;
	}

	:global([data-theme='dark']) .webhook-app-pill {
		border-color: rgba(90, 190, 255, 0.32);
		background: rgba(55, 166, 230, 0.14);
		color: #7dcfff;
	}

	:global(html[data-ui-flat]) .webhook-profile-card {
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.profile-overlay),
		:global(.webhook-profile-card) {
			animation: none;
			transition: none;
		}
	}
</style>

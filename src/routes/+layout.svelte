<script lang="ts">
	// Global design system (tokens + base, then aero component styles).
	import '$lib/styles/theme.css';
	import '$lib/styles/aero.css';
	import '$lib/styles/auth.css';
	// Phosphor icon font (light + duotone variants used throughout).
	import '@phosphor-icons/web/light';
	import '@phosphor-icons/web/duotone';
	import ThemeSwitch from '$lib/components/ThemeSwitch.svelte';
	import BackgroundPicker from '$lib/components/BackgroundPicker.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { state as wsState } from '$lib/store/websocket.svelte';
	import { meId } from '$lib/store/session.svelte';
	// Overlay "Reconectando…" (estilo Discord, respeitando o tema).
	// Só aparece para usuário autenticado, quando uma conexão previamente
	// estabelecida caiu (flag `reconnecting` do store de websocket).
	const showReconnect = $derived(meId() !== null && wsState.reconnecting);
</script>

<slot />

{#if showReconnect}
	<div class="reconnect-overlay" role="alert" aria-live="assertive">
		<div class="reconnect-content">
			<span class="reconnect-icon" aria-hidden="true">
				<Icon name="wifi-off" variant="light" size={36} />
			</span>
			<p class="reconnect-title">Reconectando…</p>
			<p class="reconnect-sub">
				Reestabelecendo a conexão com o servidor. Pode levar alguns segundos.
			</p>
		</div>
	</div>
{/if}

<!-- Window-level theme toggle: fixed bottom-right, hidden on mobile
	(mobile uses the settings page for theme). -->
<div class="theme-global">
	<ThemeSwitch />
</div>

<!-- Background picker: fixed bottom-right tip, outside the shell. -->
<BackgroundPicker />

<style>
	/* Fixed window-level theme toggle: glued to the bottom-right corner.
	 * (aero.css sets .theme-switch to absolute, so we pin it directly.
	 * :global() because .theme-switch lives in the ThemeSwitch component.) */
	.theme-global :global(.theme-switch) {
		position: fixed !important;
		bottom: 16px;
		right: 16px;
		z-index: 999;
	}
	@media (max-width: 1600px) {
		.theme-global :global(.theme-switch) {
			display: none;
		}
	}

	/* Overlay de reconexão (estilo Discord): tela cheia, blur de fundo e
	 * vidro respeitando o tema atual. */
	.reconnect-overlay {
		position: fixed;
		inset: 0;
		z-index: 3000;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0;
		background:
			radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.18) 55%),
			linear-gradient(145deg, rgba(240, 248, 255, 0.62), rgba(219, 234, 250, 0.74));
		backdrop-filter: blur(18px) saturate(140%);
		-webkit-backdrop-filter: blur(18px) saturate(140%);
		color: var(--text);
	}
	:global([data-theme='dark']) .reconnect-overlay {
		background:
			radial-gradient(circle at 50% 30%, rgba(90, 130, 175, 0.35), rgba(30, 52, 84, 0.3) 55%),
			linear-gradient(145deg, rgba(24, 41, 64, 0.8), rgba(12, 24, 42, 0.9));
		backdrop-filter: blur(18px) saturate(150%);
	}
	.reconnect-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		text-align: center;
		max-width: 360px;
		padding: 24px;
	}
	.reconnect-icon {
		display: flex;
		opacity: 0.85;
	}
	.reconnect-title {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
	}
	.reconnect-sub {
		margin: 0;
		font-size: 13px;
		color: var(--muted-soft);
		line-height: 1.5;
	}
</style>

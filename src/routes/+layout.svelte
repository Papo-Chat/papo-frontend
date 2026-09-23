<script lang="ts">
	// Global design system (tokens + base, then aero component styles).
	import '$lib/styles/theme.css';
	import '$lib/styles/aero.css';
	import '$lib/styles/auth.css';
	// Phosphor icon font (light + duotone variants used throughout).
	import '@phosphor-icons/web/light';
	import '@phosphor-icons/web/duotone';
	import ThemeSwitch from '$lib/components/ThemeSwitch.svelte';
</script>

<slot />

<!-- Window-level theme toggle: fixed bottom-right, hidden on mobile
	(mobile uses the settings page for theme). -->
<div class="theme-global">
	<ThemeSwitch />
</div>

<style>
	/* Fixed window-level theme toggle: glued to the bottom-right corner.
	 * (aero.css sets .theme-switch to absolute, so we pin it directly.
	 * :global() because .theme-switch lives in the ThemeSwitch component.) */
	.theme-global :global(.theme-switch){
		position: fixed !important;
		bottom: 16px;
		right: 16px;
		z-index: 999;
	}
	@media (max-width: 940px){
		.theme-global :global(.theme-switch){
			display: none;
		}
	}
</style>

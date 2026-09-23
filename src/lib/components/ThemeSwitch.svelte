<script lang="ts">
	import { theme, setTheme } from '$lib/store/theme.svelte';

	function toggle(): void {
		setTheme($theme === 'light' ? 'dark' : 'light');
	}
</script>

<button
	class="theme-switch"
	aria-pressed={$theme === 'dark'}
	title="Alternar tema"
	aria-label="Alternar tema claro e escuro"
	on:click={toggle}
>
	<span class="theme-sun">☀</span>
	<span class="theme-knob"></span>
	<span class="theme-moon">☾</span>
</button>

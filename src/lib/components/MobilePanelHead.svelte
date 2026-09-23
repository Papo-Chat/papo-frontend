<script lang="ts">
	// Sticky header for the sidebar / members panels (shown on all breakpoints,
	// used as a drawer header on mobile). Reused by both panels.
	import Icon from './Icon.svelte';

	let {
		icon = 'hash',
		title = '',
		onClose
	} = $props<{
		icon?: string;
		title?: string;
		onClose?: () => void;
	}>();
</script>

<div class="mobile-panel-head">
	<div class="mobile-panel-title">
		<Icon name={icon} variant="light" />
		<strong>{title}</strong>
	</div>
	{#if onClose}
		<button
			class="mobile-panel-close"
			onclick={onClose}
			aria-label="Fechar"
			title="Fechar"
		>
			<Icon name="x" variant="light" />
		</button>
	{/if}
</div>

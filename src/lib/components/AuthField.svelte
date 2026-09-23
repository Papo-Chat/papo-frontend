<script lang="ts">
	// Reusable form field for auth/admin screens (label + glass input shell + icon).
	// Styles come from the global `auth.css` (`.field`, `.input-shell`, `.input-icon`).
	import Icon from './Icon.svelte';

	let {
		label,
		icon = 'user',
		placeholder = '',
		type = 'text'
	} = $props<{
		label: string;
		icon?: string;
		placeholder?: string;
		type?: string;
	}>();

	let value = $state('');

	function onInput(e: Event): void {
		value = (e.target as HTMLInputElement).value;
	}
</script>

<div class="field">
	{#if label}
		<label>{label}</label>
	{/if}
	<div class="input-shell">
		<div class="input-icon"><Icon name={icon} variant="light" /></div>
		<input
			type={type}
			placeholder={placeholder}
			aria-label={label}
			{value}
			on:input={onInput}
		/>
	</div>
</div>

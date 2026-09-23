<script lang="ts">
	// Phosphor icon wrapper. Renders a `<i>` with the `ph-{variant} ph-{name}`
	// classes that the @phosphor-icons/web font CSS uses to paint the glyph.

	let {
		name,
		variant = 'light',
		size = 20,
		title,
		ariaHidden = true
	} = $props<{
		name: string;
		variant?: 'light' | 'duotone';
		size?: number | string;
		title?: string;
		ariaHidden?: boolean;
	}>();
</script>

<i
	class="ph-{variant} ph-{name}"
	aria-hidden={ariaHidden}
	aria-label={title ? title : undefined}
	role={title ? 'img' : 'presentation'}
	style="font-size: {typeof size === 'number' ? size : size}px"
></i>

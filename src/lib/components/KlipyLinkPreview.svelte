<script lang="ts">
	import { fetchKlipyGif, type KlipyGif } from '$lib/utils/klipy';

	let {
		slug,
		link,
		apiKey,
		onResolved
	} = $props<{
		slug: string;
		link: string;
		apiKey: string;
		onResolved?: (resolved: boolean) => void;
	}>();

	let gif = $state<KlipyGif | null>(null);

	$effect(() => {
		const currentSlug = slug;
		const currentKey = apiKey.trim();
		const controller = new AbortController();
		let cancelled = false;
		gif = null;

		if (!currentKey || !currentSlug) {
			onResolved?.(false);
			return () => controller.abort();
		}

		void fetchKlipyGif(currentSlug, currentKey, controller.signal)
			.then((result) => {
				if (cancelled) return;
				gif = result;
				onResolved?.(!!result);
			})
			.catch(() => {
				if (cancelled) return;
				gif = null;
				onResolved?.(false);
			});

		return () => {
			cancelled = true;
			controller.abort();
		};
	});

	function handleImageError(): void {
		if (!gif) return;
		gif = null;
		onResolved?.(false);
	}
</script>

{#if gif}
	<figure class="klipy-preview">
		<a class="klipy-image-link" href={link} target="_blank" rel="noopener noreferrer" aria-label={gif.title}>
			<img src={gif.url} alt={gif.title} loading="lazy" onerror={handleImageError} />
		</a>
		<figcaption>
			<a href={link} target="_blank" rel="noopener noreferrer">GIF via KLIPY</a>
		</figcaption>
	</figure>
{/if}

<style>
	.klipy-preview {
		display: grid;
		justify-items: start;
		gap: 5px;
		max-width: min(590px, 100%);
		margin: 5px 0 2px;
	}
	.klipy-image-link {
		display: block;
		max-width: 100%;
		overflow: hidden;
		border: 1px solid var(--line-strong);
		border-radius: 13px;
		background: var(--media-surface, var(--surface));
	}
	.klipy-image-link img {
		display: block;
		max-width: 100%;
		max-height: min(70dvh, 620px);
		width: auto;
		height: auto;
		object-fit: contain;
	}
	figcaption {
		font-size: 10px;
		color: var(--muted-soft);
	}
	figcaption a {
		color: inherit;
		text-decoration: none;
	}
	figcaption a:hover {
		color: var(--link);
		text-decoration: underline;
	}
</style>

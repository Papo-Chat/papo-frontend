<script lang="ts">
	// Shared emoji picker used by the composer emoji button and the message
	// reaction button. Glass language matches the header popovers (aero.css).
	//
	// Positioning: the card is only mounted while `open` ({#if open}), so a
	// closed picker never inflates the scroll container's scrollWidth/Height.
	// After mount we `tick()` once, then compute the layout (flip above/below
	// the trigger to stay inside the chat's visible area, like
	// ReactionUsersPopover, and shrink if wider than the container). Outside
	// the `.chat` container (composer, at the bottom) it always opens above.
	import { tick } from 'svelte';
	import { allEmojis, type EmojiOption } from '$lib/utils/emojis';
	import { blobToUrl } from '$lib/utils/media';
	import Icon from './Icon.svelte';

	let {
		open = $bindable(false),
		onOpenChange = () => {},
		onPick
	} = $props<{
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		onPick?: (emoji: EmojiOption) => void;
	}>();

	let cardEl: HTMLElement | null = null;
	let filter = $state('');
	let flip = $state<'above' | 'below'>('above');
	// Revealed one tick after mount so the CSS fade-in plays without a flash.
	// The element only exists while `open` ({#if open}).
	let shown = $state(false);
	const all = allEmojis();

	const filtered = $derived(
		all.filter((opt) => {
			const q = filter.trim().toLowerCase();
			if (!q) return true;
			return (
				opt.label.toLowerCase().includes(q) || (opt.kind === 'unicode' && opt.char.includes(q))
			);
		})
	);
	const unicode = $derived(filtered.filter((o) => o.kind === 'unicode'));
	const custom = $derived(filtered.filter((o) => o.kind === 'custom'));

	function close(): void {
		if (open) {
			open = false;
			onOpenChange(false);
		}
	}

	function pick(opt: EmojiOption): void {
		onPick?.(opt);
		close();
	}

	function onFilterInput(e: Event): void {
		const el = e.target as HTMLInputElement;
		filter = el.value;
	}

	// Fresh start each time the picker opens.
	$effect(() => {
		if (open) filter = '';
	});

	// Decide above/below and horizontal offset so the card stays inside the
	// visible column (avoids inflating scrollHeight and horizontal overflow).
	// Same approach as ReactionUsersPopover: clamp to the container's client
	// area (border-box minus the vertical scrollbar gutter) and shrink the
	// card if it's wider than the client area. Horizontal reference: the
	// nearest `.chat` (reaction picker) or the main column (composer, which
	// sits outside `.chat`). Always open above when neither is found.
	// Recompute on chat scroll.
	function computeLayout(): { flip: 'above' | 'below'; leftPx: number; widthPx: number | null } {
		const container = cardEl?.closest('.chat') ?? cardEl?.closest('main.main');
		const trigger = cardEl?.parentElement;
		if (!cardEl || !container || !trigger) return { flip: 'above', leftPx: 0, widthPx: null };
		const containerRect = container.getBoundingClientRect();
		const triggerRect = trigger.getBoundingClientRect();
		const w = cardEl.offsetWidth;
		const h = cardEl.offsetHeight;
		const pad = 8;
		const belowSpace = containerRect.bottom - triggerRect.bottom - pad;
		const aboveSpace = triggerRect.top - containerRect.top - pad;
		let flip: 'above' | 'below';
		if (h <= aboveSpace) flip = 'above';
		else if (h <= belowSpace) flip = 'below';
		else flip = aboveSpace >= belowSpace ? 'above' : 'below';
		// `left: 0` is the CSS default relative to the trigger, so the
		// horizontal reference must be the trigger. The usable horizontal
		// band is the client area (border-box minus the vertical scrollbar
		// gutter), so clamp to `clientWidth`, not `right`.
		const clientLeft = containerRect.left;
		const clientRight = clientLeft + container.clientWidth;
		const leftMin = clientLeft + pad - triggerRect.left;
		const leftMax = clientRight - pad - triggerRect.left - w;
		let leftPx = Math.min(0, leftMax);
		if (leftPx < leftMin) leftPx = leftMin;
		// Floor so a fractional offset can't overshoot the edge by <1px.
		leftPx = Math.floor(leftPx);
		// If the card is wider than the client area, no offset can keep it
		// inside — shrink it to fit (avoids a guaranteed overflow).
		let widthPx: number | null = null;
		const availableWidth = container.clientWidth - pad * 2;
		if (w > availableWidth) {
			widthPx = Math.max(Math.floor(availableWidth), 120);
		}
		return { flip, leftPx, widthPx };
	}

	function applyLayout(): void {
		if (!cardEl) return;
		const { flip: f, leftPx, widthPx } = computeLayout();
		flip = f;
		cardEl.style.left = leftPx ? `${leftPx}px` : '';
		cardEl.style.width = widthPx ? `${widthPx}px` : '';
	}

	// Mount → clamp before the first paint, then reveal (fade-in). The card
	// only exists while `open`, so this single effect is where the layout is
	// computed. Re-layout on chat scroll: the anchor (e.g. the reaction-add
	// wrap in a message) may have moved — a new reaction pill shifts it to
	// the right — so the stored leftPx/flip would be stale.
	$effect(() => {
		if (!open) {
			shown = false;
			return;
		}
		shown = false;
		applyLayout();
		// Reveal one tick after mount so the CSS fade-in plays without a flash.
		// Called in both branches (with/without a `.chat` anchor).
		const reveal = () => {
			tick().then(() => {
				if (open) shown = true;
			});
		};
		const chat = cardEl?.closest('.chat');
		if (chat) {
			const handler = (e: Event) => {
				applyLayout();
			};
			chat.addEventListener('scroll', handler, { passive: true });
			reveal();
			return () => {
				chat.removeEventListener('scroll', handler);
			};
		}
		reveal();
	});

	// Close on outside click + Escape. Listeners only exist while open.
	$effect(() => {
		if (!open) return;

		function onPointerDown(e: PointerEvent): void {
			if (cardEl && !cardEl.contains(e.target as Node)) {
				// Ignore clicks on the trigger button (an ancestor of the
				// picker) so toggling the button doesn't flicker it.
				const trigger = cardEl.closest('button');
				if (trigger && trigger.contains(e.target as Node)) return;
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
<div
	class="emoji-picker {shown ? 'open' : ''} {flip}"
	role="dialog"
	aria-label="Emojis"
	bind:this={cardEl}
>
	<div class="emoji-picker-head">
		<input
			type="text"
			class="emoji-filter"
			placeholder="Filtrar emojis…"
			aria-label="Filtrar emojis"
			oninput={onFilterInput}
		/>
		<button class="popover-close" onclick={close} aria-label="Fechar">
			<Icon name="x" variant="light" />
		</button>
	</div>

	<div class="emoji-picker-body">
		{#if custom.length}
			<div class="emoji-section">
				<span class="emoji-section-label">Personalizados</span>
				<div class="emoji-grid">
					{#each custom as opt (`c-${opt.name}`)}
						<button class="emoji custom" title={opt.name} onclick={() => pick(opt)}>
							{#if opt.image_blob}
								<img src={blobToUrl(opt.image_blob, opt.format)} alt={opt.name} />
							{:else}
								<span class="custom-name">{opt.name}</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if unicode.length}
			<div class="emoji-section">
				<span class="emoji-section-label">Comuns</span>
				<div class="emoji-grid">
					{#each unicode as opt (opt.char)}
						<button class="emoji unicode" title={opt.label} onclick={() => pick(opt)}>
							{opt.char}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if !unicode.length && !custom.length}
			<div class="emoji-empty">Nada encontrado.</div>
		{/if}
	</div>
</div>
{/if}

<style>
	.emoji-picker {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		width: min(320px, calc(100vw - 24px));
		z-index: 320;
		border-radius: 18px;
		border: 1px solid rgba(255, 255, 255, 0.55);
		background: linear-gradient(145deg, rgba(255, 255, 255, 0.82), rgba(238, 248, 253, 0.74));
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.92),
			0 18px 44px rgba(20, 80, 120, 0.2),
			0 6px 14px rgba(20, 80, 120, 0.1);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
		overflow: hidden;
		opacity: 0;
		transform: translateY(8px) scale(0.98);
		transition:
			opacity 0.18s var(--ease),
			transform 0.18s var(--ease),
			visibility 0s 0.18s;
		visibility: hidden;
		pointer-events: none;
	}
	.emoji-picker.below {
		bottom: auto;
		top: calc(100% + 8px);
		transform: translateY(-8px) scale(0.98);
	}
	.emoji-picker.open {
		opacity: 1;
		transform: translateY(0) scale(1);
		visibility: visible;
		pointer-events: auto;
		transition:
			opacity 0.18s var(--ease),
			transform 0.18s var(--ease),
			visibility 0s;
	}
	.emoji-picker-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-bottom: 1px solid rgba(76, 132, 170, 0.16);
	}
	.emoji-filter {
		flex: 1;
		min-width: 0;
		height: 38px;
		padding: 0 12px;
		border-radius: 12px;
		border: 1px solid rgba(76, 132, 170, 0.22);
		background: linear-gradient(145deg, rgba(255, 255, 255, 0.72), rgba(238, 248, 253, 0.62));
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
		font: inherit;
		color: var(--text);
		outline: 0;
		transition:
			box-shadow 0.18s ease,
			border-color 0.18s ease;
	}
	.emoji-filter:focus {
		box-shadow: 0 0 0 3px rgba(56, 167, 235, 0.18);
		border-color: rgba(100, 196, 250, 0.6);
	}
	.emoji-filter::placeholder {
		color: var(--muted-soft);
	}
	.emoji-picker-close {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.6);
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(213, 235, 248, 0.55));
		color: var(--text);
		cursor: pointer;
		display: grid;
		place-items: center;
		flex: none;
		transition:
			transform 0.18s var(--ease),
			box-shadow 0.18s ease;
	}
	.emoji-picker-close:hover {
		transform: translateY(-1px);
	}
	.emoji-picker-close:active {
		transform: scale(0.95);
	}
	.emoji-picker-body {
		max-height: 320px;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 8px;
	}
	.emoji-section {
		margin-bottom: 4px;
	}
	.emoji-section-label {
		display: block;
		margin: 6px 8px 4px;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.emoji-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, 54px);
		gap: 4px;
	}
	.emoji {
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		border: 1px solid rgba(76, 132, 170, 0.18);
		border-radius: 10px;
		background: linear-gradient(145deg, rgba(255, 255, 255, 0.6), rgba(238, 248, 253, 0.5));
		cursor: pointer;
		transition:
			transform 0.16s var(--ease),
			box-shadow 0.16s ease,
			background 0.16s ease;
	}
	.emoji:hover {
		transform: translateY(-2px) scale(1.06);
		background: linear-gradient(145deg, rgba(255, 255, 255, 0.82), rgba(238, 248, 253, 0.72));
		box-shadow: 0 6px 14px rgba(20, 80, 120, 0.16);
	}
	.emoji:active {
		transform: scale(0.92);
	}
	.emoji.unicode {
		font-size: 20px;
		line-height: 1;
	}
	.emoji.custom {
		font-size: 11px;
	}
	.emoji.custom img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.emoji.custom .custom-name {
		font-size: 11px;
		font-weight: 700;
		color: var(--text);
		line-height: 1.2;
		padding: 0 2px;
	}
	.emoji-empty {
		grid-column: 1 / -1;
		text-align: center;
		padding: 20px 0;
		color: var(--muted-soft);
		font-size: 13px;
	}

	/* dark mode — :global() so Svelte doesn't strip the [data-theme] part
	 * (it lives on <html>, outside this component's DOM). */
	:global([data-theme='dark']) .emoji-picker {
		background:
			radial-gradient(circle at 15% -18%, rgba(116, 207, 255, 0.14), transparent 34%),
			linear-gradient(145deg, rgba(25, 51, 68, 0.9), rgba(10, 33, 48, 0.82));
		border-color: rgba(182, 224, 250, 0.18);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.12),
			0 26px 56px rgba(0, 0, 0, 0.32),
			0 8px 22px rgba(0, 0, 0, 0.16);
	}
	:global([data-theme='dark']) .emoji-picker-head {
		border-bottom-color: rgba(179, 223, 248, 0.12);
		background: linear-gradient(180deg, rgba(125, 203, 247, 0.05), rgba(255, 255, 255, 0.012));
	}
	:global([data-theme='dark']) .emoji-filter {
		background: linear-gradient(145deg, rgba(25, 51, 68, 0.82), rgba(15, 38, 52, 0.72));
		border-color: rgba(182, 224, 250, 0.18);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
	}
	:global([data-theme='dark']) .emoji-picker-close {
		background: rgba(83, 111, 129, 0.28);
		border-color: rgba(182, 224, 250, 0.12);
		color: var(--text);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
	}
	:global([data-theme='dark']) .emoji {
		background: linear-gradient(145deg, rgba(25, 51, 68, 0.72), rgba(15, 38, 52, 0.62));
		border-color: rgba(182, 224, 250, 0.14);
	}
	:global([data-theme='dark']) .emoji:hover {
		background: linear-gradient(145deg, rgba(45, 79, 100, 0.72), rgba(25, 51, 68, 0.62));
		box-shadow: 0 6px 14px rgba(0, 0, 0, 0.24);
	}
</style>

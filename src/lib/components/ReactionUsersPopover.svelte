<script lang="ts">
	// Hover menu for a reaction pill: who reacted with that emoji.
	// Glass language matches the header popovers (aero.css).
	//
	// Positioning: the popover is `position: absolute` inside the `.chat`
	// scroll container. If it extends past the chat's content it inflates
	// `scrollHeight`, which makes the chat's auto-scroll jump the last
	// message up (the "gap" regression). So we flip it above/below the pill
	// to keep it inside the chat's visible bounds — always, not just when
	// open — so it never inflates the scroll area.
	import type { UserSummary } from '$lib/types';
	import Avatar from './Avatar.svelte';

	let {
		emoji,
		users,
		open = $bindable(false),
		onOpenChange = () => {}
	} = $props<{
		emoji: string;
		users: UserSummary[];
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
	}>();

	let cardEl: HTMLElement | null = null;
	let flip = $state<'below' | 'above'>('below');

	const countText = $derived(
		`${users.length} ${users.length === 1 ? 'pessoa reagiu' : 'pessoas reagiram'}`
	);

	// Decide above/below and horizontal offset so the card stays inside the
	// chat's visible bounds. The vertical flip avoids inflating scrollHeight;
	// the horizontal clamp avoids inflating scrollWidth (a popover that extends
	// past the chat's right edge makes the chat show a horizontal scrollbar).
	// Always applied, not just when open, so the scroll area never inflates.
	function computeLayout(): { flip: 'below' | 'above'; leftPx: number; widthPx: number | null } {
		const chat = cardEl?.closest('.chat');
		const group = cardEl?.closest('.reaction-group');
		const pill = group?.querySelector('button.react');
		if (!cardEl || !pill || !chat || !group) return { flip: 'below', leftPx: 0, widthPx: null };
		const chatRect = chat.getBoundingClientRect();
		const groupRect = group.getBoundingClientRect();
		const pillRect = pill.getBoundingClientRect();
		const w = cardEl.offsetWidth;
		const h = cardEl.offsetHeight;
		// Extra margin so subpixel rounding can't push the card past the edge.
		const pad = 8;
		const belowSpace = chatRect.bottom - pillRect.bottom - pad;
		const aboveSpace = pillRect.top - chatRect.top - pad;
		let flip: 'below' | 'above';
		if (h <= belowSpace) flip = 'below';
		else if (h <= aboveSpace) flip = 'above';
		else flip = belowSpace >= aboveSpace ? 'below' : 'above';
		// `left: 0` is relative to the .reaction-group (the containing block),
		// so the horizontal reference must be the group, not the pill.
		// The usable horizontal band is the client area (border-box minus the
		// vertical scrollbar gutter), so clamp to `clientWidth`, not `right`.
		const clientLeft = chatRect.left;
		const clientRight = clientLeft + chat.clientWidth;
		const leftMin = clientLeft + pad - groupRect.left;
		const leftMax = clientRight - pad - groupRect.left - w;
		let leftPx = Math.min(0, leftMax);
		if (leftPx < leftMin) leftPx = leftMin;
		// Floor so a fractional offset can't overshoot the edge by <1px.
		leftPx = Math.floor(leftPx);
		// If the card is wider than the client area, no offset can keep it
		// inside — shrink it to fit (avoids a guaranteed overflow).
		let widthPx: number | null = null;
		const availableWidth = chat.clientWidth - pad * 2;
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

	// Compute the layout whenever the popover is mounted and on every chat
	// scroll (the pill moves relative to the chat's visible bounds).
	$effect(() => {
		if (!cardEl) return;
		applyLayout();
		const chat = cardEl.closest('.chat');
		if (!chat) return;
		const handler = (e: Event) => {
			// Throttle: only recompute when the scroll position actually
			// changes the available space.
			applyLayout();
		};
		chat.addEventListener('scroll', handler, { passive: true });
		return () => {
			chat.removeEventListener('scroll', handler);
		};
	});

	// Close on outside click + Escape. Listeners only exist while open.
	$effect(() => {
		if (!open) return;

		function onPointerDown(e: PointerEvent): void {
			if (cardEl && !cardEl.contains(e.target as Node)) {
				open = false;
				onOpenChange(false);
			}
		}

		function onKeyDown(e: KeyboardEvent): void {
			if (e.key === 'Escape') {
				open = false;
				onOpenChange(false);
			}
		}

		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);

		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	});
</script>

<div
	class="reaction-users {open ? 'open' : ''} {flip}"
	role="dialog"
	aria-label={`Usuários que reagiram com ${emoji}`}
	bind:this={cardEl}
>
	<div class="reaction-users-head">
		<span class="reaction-users-emoji" aria-hidden="true">{emoji}</span>
		<span class="reaction-users-count">{countText}</span>
	</div>

	<ul class="reaction-users-list">
		{#each users as u (u.id)}
			<li class="reaction-user">
				<Avatar username={u.username} nickname={u.nickname} size={30} />
				<span class="reaction-user-name">{u.nickname || u.username}</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	/* .above flips the popover above the pill so it never extends past the
	 * chat's content (which would inflate scrollHeight and cause the gap).
	 * The ::before sheen covers the 10px gap so the mouse can cross. */
	.reaction-users.above{
		top: auto;
		bottom: calc(100% + 10px);
		transform-origin: bottom left;
		transform: translateY(6px) scale(.97);
	}
	.reaction-users.above.open{
		transform: translateY(0) scale(1);
		animation: popoverPopUp .3s var(--ease);
	}
</style>

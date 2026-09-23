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

	function computeFlip(): 'below' | 'above' {
		const chat = cardEl?.closest('.chat');
		const group = cardEl?.closest('.reaction-group');
		const pill = group?.querySelector('button.react');
		if (!cardEl || !pill || !chat) return 'below';
		const chatRect = chat.getBoundingClientRect();
		const pillRect = pill.getBoundingClientRect();
		const h = cardEl.offsetHeight;
		const pad = 6;
		const belowSpace = chatRect.bottom - pillRect.bottom - pad;
		const aboveSpace = pillRect.top - chatRect.top - pad;
		if (h <= belowSpace) return 'below';
		if (h <= aboveSpace) return 'above';
		return belowSpace >= aboveSpace ? 'below' : 'above';
	}

	// Compute the flip whenever the popover is mounted and on every chat
	// scroll (the pill moves relative to the chat's visible bounds).
	$effect(() => {
		if (!cardEl) return;
		flip = computeFlip();
		const chat = cardEl.closest('.chat');
		if (!chat) return;
		const handler = (e: Event) => {
			// Throttle: only recompute when the scroll position actually
			// changes the available space.
			flip = computeFlip();
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

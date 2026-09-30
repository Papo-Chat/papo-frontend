<script lang="ts">
    // Hover menu for a reaction pill: who reacted with that emoji.
    // Glass language matches the header popovers (aero.css).
    //
    // Positioning: the popover is `position: absolute` inside the `.chat`
    // scroll container. It is only mounted while `open` ({#if open}), so a
    // closed popover never inflates the chat's scrollWidth/Height (which would
    // make the chat horizontally scrollable on WebKit and jump the last message
    // up, the "gap" regression). After mount we `tick()` once, then compute the
    // layout — flipping above/below the pill and clamping/shrinking so the card
    // stays inside the chat's visible bounds.
    import { tick } from 'svelte';
    import type { UserSummary } from '$lib/types';
    import Avatar from './Avatar.svelte';
    import ReactionEmoji from './ReactionEmoji.svelte';

    let {
        emoji,
        emojiId = null,
        unicode = null,
        users,
        open = $bindable(false),
        onOpenChange = () => {},
        isMine = false,
        onToggle,
        onLoadMore = null
    } = $props<{
        emoji: string;
        emojiId?: string | null;
        unicode?: string | null;
        users: UserSummary[];
        open?: boolean;
        onOpenChange?: (open: boolean) => void;
        isMine?: boolean;
        onToggle?: (() => void) | null;
        onLoadMore?: (() => void) | null;
    }>();

    let cardEl: HTMLElement | null = null;
    let flip = $state<'below' | 'above'>('below');
    // Revealed one tick after mount so the CSS pop animation plays without a
    // flash. The element only exists while `open` ({#if open}).
    let shown = $state(false);

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

    // Compute the layout on mount (clamped before the first paint) and on every
    // chat scroll (the pill moves relative to the chat's visible bounds). The
    // element only exists while `open`, so this single effect is where the
    // layout is computed.
    $effect(() => {
        if (!open) {
            shown = false;
            return;
        }
        shown = false;
        applyLayout();
        // Reveal one tick after mount so the CSS pop animation plays without a
        // flash. Called in both branches (with/without a `.chat` anchor).
        const reveal = () => {
            tick().then(() => {
                if (open) shown = true;
            });
        };
        const chat = cardEl?.closest('.chat');
        if (chat) {
            const handler = (e: Event) => {
                // Throttle: only recompute when the scroll position actually
                // changes the available space.
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

    // A lista de usuários é populada assíncronamente (após o fetch), depois
    // do popover montar. Recalcula o layout quando a lista muda de tamanho
    // (ex.: 0 -> N após o fetch), para a carta nunca ficar com altura medida
    // na versão vazia.
    $effect(() => {
        const len = users.length;
        if (open) applyLayout();
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
    // Scroll-based loading: quando o usuário rola a lista até o fim,
    // carrega a página seguinte (decisão do pai via `onLoadMore`).
    function onListScroll(e: Event): void {
        const sc = e.target as HTMLElement;
        const distance = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
        if (distance < 120 && onLoadMore) {
            onLoadMore();
        }
    }
</script>

{#if open}
    <div
        class="reaction-users {shown ? 'open' : ''} {flip}"
        role="dialog"
        aria-label={unicode ? `Usuários que reagiram com ${unicode}` : 'Usuários que reagiram com emoji personalizado'}
        bind:this={cardEl}
    >
        <div class="reaction-users-head">
            <span class="reaction-users-emoji" aria-hidden="true">
                <ReactionEmoji {unicode} {emojiId} />
            </span>
            <span class="reaction-users-count">{countText}</span>
        </div>

        <ul class="reaction-users-list" onscroll={onListScroll}>
            {#each users as u (u.id)}
                <li class="reaction-user">
                    <Avatar user={u} size={30} />
                    <span class="reaction-user-name">{u.nickname || u.username}</span>
                </li>
            {/each}
        </ul>

        {#if onToggle}
            <div class="reaction-users-footer">
                <span class="reaction-users-you">
                    {isMine ? 'Você reagiu' : 'Você'}
                </span>
                <button
                    type="button"
                    class="reaction-users-toggle"
                    onclick={onToggle}
                    aria-label={isMine ? 'Remover a sua reação' : 'Adicionar a sua reação'}
                >
                    {isMine ? 'Tirar Reação' : 'Reagir'}
                </button>
            </div>
        {/if}
    </div>
{/if}

<style>
    /* .above flips the popover above the pill so it never extends past the
     * chat's content (which would inflate scrollHeight and cause the gap).
     * The ::before sheen covers the 10px gap so the mouse can cross. */
    .reaction-users.above {
        top: auto;
        bottom: calc(100% + 10px);
        transform-origin: bottom left;
        transform: translateY(6px) scale(0.97);
    }
    .reaction-users.above.open {
        transform: translateY(0) scale(1);
        animation: popoverPopUp 0.3s var(--ease);
    }

    /* Footer: lets mobile users (no hover) react/unreact from inside the list. */
    .reaction-users-footer {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border-top: 1px solid rgba(86, 143, 177, 0.16);
        background: linear-gradient(
            180deg,
            rgba(238, 249, 255, 0.55),
            rgba(219, 240, 252, 0.4)
        );
    }
    :global([data-theme='dark']) .reaction-users-footer{
		background:
			radial-gradient(circle at 15% -18%, rgba(116, 207, 255, 0.14), transparent 34%),
			linear-gradient(145deg, rgba(25, 51, 68, 0.9), rgba(10, 33, 48, 0.82));

    }
    .reaction-users-you {
        font-size: 11px;
        font-weight: 800;
        color: var(--link-muted);
    }
    .reaction-users-toggle {
        margin-left: auto;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        padding: 4px 12px;
        border: 1px solid var(--blue);
        border-radius: 999px;
        background: rgba(10, 132, 255, 0.12);
        color: var(--blue);
        cursor: pointer;
        transition: 0.16s var(--ease);
    }
    .reaction-users-toggle:hover {
        background: rgba(10, 132, 255, 0.2);
    }
</style>
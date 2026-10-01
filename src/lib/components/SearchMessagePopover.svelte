<script lang="ts">
    // Busca real (POST /search, debounced) sobre todos os canais legíveis.
    // Clique num resultado dispara onResultClick; a página decide destacar
    // localmente ou navegar (com scroll target).
    import { api } from '$lib/api';
    import * as usersStore from '$lib/store/users.svelte';
    import * as channelsStore from '$lib/store/channels.svelte';
    import * as messagesStore from '$lib/store/messages.svelte';
    import type { SearchRequest, SearchResult, UserSummary } from '$lib/types';
    import { formatTime } from '$lib/utils/time';
    import { nextCursor, type KeysetCursor } from '$lib/utils/keyset';
    import Icon from './Icon.svelte';
    import Avatar from './Avatar.svelte';
    import CompactMessageContent from './CompactMessageContent.svelte';

    let {
        open = $bindable(false),
        searchQuery = $bindable(''),
        onOpenChange,
        onResultClick
    } = $props<{
        open?: boolean;
        searchQuery?: string;
        onOpenChange?: (open: boolean) => void;
        onResultClick?: (result: SearchResult) => void;
    }>();

    let el: HTMLElement | null = null;
    let inputEl: HTMLInputElement | null = null;

    let results = $state<SearchResult[]>([]);
    let loading = $state(false);
    let error: string | null = $state(null);
    let filtersOpen = $state(false);
    // Cursor de paginação (keyset since + last_id) e flag de página seguinte.
    let cursor: KeysetCursor | null = $state(null);
    let hasMore = $state(false);

    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    let requestGeneration = 0;

    // Filtros combináveis (API /search): autor, intervalo de datas, ordem e
    // anexos. `containsAttachment`: '' = sem filtro, 'with' = com, 'without' = sem.
    type AttachmentFilter = '' | 'with' | 'without';

    let filters = $state<{
        author: string;
        dateStart: string;
        dateEnd: string;
        order: 'asc' | 'desc';
        containsAttachment: AttachmentFilter;
        channelId: string;
        mention: string;
        hasLink: boolean;
    }>({
        author: '',
        dateStart: '',
        dateEnd: '',
        order: 'desc',
        containsAttachment: '',
        channelId: '',
        mention: '',
        hasLink: false
    });

    const authorOptions = $derived([...usersStore.state.byId.values()]);
    const channelOptions = $derived(
        channelsStore.state.ordered
            .map((id) => channelsStore.state.byId.get(id))
            .filter((channel) => channel && channel.type === 'text')
    );

    const hasActiveFilters = $derived(
        searchQuery.trim() !== '' ||
        filters.author !== '' ||
        filters.dateStart !== '' ||
        filters.dateEnd !== '' ||
        filters.containsAttachment !== '' ||
        filters.channelId !== '' ||
        filters.mention !== '' ||
        filters.hasLink
    );

    // Used by the debounce effect so every searchable filter participates in
    // reactivity. Order alone is not a valid API filter, but changes the
    // ordering whenever at least one real filter is active.
    const searchSignature = $derived(
        [
            searchQuery.trim(),
            filters.author,
            filters.dateStart,
            filters.dateEnd,
            filters.order,
            filters.containsAttachment,
            filters.channelId,
            filters.mention,
            filters.hasLink ? 'link' : ''
        ].join('|')
    );

    // Request com os filtros atuais. O backend aceita qualquer combinação
    // com pelo menos um filtro real; texto é opcional.
    function buildRequest(): SearchRequest {
        const req: SearchRequest = {};
        const text = searchQuery.trim();
        if (text) {
            req.text = text;
        }
        if (filters.author) {
            req.author = filters.author;
        }
        if (filters.dateStart) {
            req.date_start = filters.dateStart;
        }
        if (filters.dateEnd) {
            req.date_end = filters.dateEnd;
        }
        if (filters.channelId) req.channel_id = filters.channelId;
        if (filters.mention) req.mention = filters.mention;
        if (filters.hasLink) req.has = 'link';
        if (filters.order !== 'desc') {
            req.order = filters.order;
        }
        if (filters.containsAttachment === 'with') {
            req.contains_attachment = true;
        } else if (filters.containsAttachment === 'without') {
            req.contains_attachment = false;
        }
        return req;
    }

    // Busca uma página. `q` = cursor (null na primeira página). Só o request
    // mais recente pode escrever estado (guarda `requestGeneration`).
    async function fetchPage(q?: { since?: string; last_id?: string }): Promise<void> {
        const generation = ++requestGeneration;
        loading = true;
        try {
            const res = await api.search.search(buildRequest(), q);
            if (generation !== requestGeneration) {
                return;
            }
            if (q) {
                // Página seguinte: anexa, deduplicando por id.
                const seen = new Set(results.map((m) => m.id));
                results = [
                    ...results,
                    ...res.results.filter((m) => !seen.has(m.id))
                ];
            } else {
                results = res.results;
            }
            hasMore = res.has_more;
            cursor = nextCursor(res.results);
            error = null;
        } catch (e) {
            if (generation === requestGeneration) {
                error = (e as Error).message || 'Falha ao buscar mensagens.';
            }
        } finally {
            if (generation === requestGeneration) {
                loading = false;
            }
        }
    }

    // Página seguinte: só quando há cursor, há mais páginas e não há fetch em
    // andamento. Chama o scroll (próximo ao fim) — sem botão "carregar mais".
    function loadMore(): void {
        if (!hasMore || !cursor || loading) {
            return;
        }
        void fetchPage({ since: cursor.since, last_id: cursor.last_id });
    }

    // Scroll-based loading: ao aproximar o fim do corpo (distance < 200px),
    // carrega a página seguinte. Sem clique, igual às mensagens do chat.
    function onBodyScroll(e: Event): void {
        const sc = e.target as HTMLElement;
        const distance = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
        if (distance < 200 && !loading && hasMore) {
            loadMore();
        }
    }

    // Debounce + cancelamento: só o request mais recente pode escrever estado.
    $effect(() => {
        if (!open) {
            if (searchTimer) {
                clearTimeout(searchTimer);
                searchTimer = null;
            }
            results = [];
            loading = false;
            error = null;
            cursor = null;
            hasMore = false;
            return;
        }

        if (searchTimer) {
            clearTimeout(searchTimer);
        }

        // Force the effect to track all search inputs, not just text.
        const signature = searchSignature;
        void signature;

        // The API requires at least one real filter. Author/date/attachment
        // are sufficient even when the text box is empty.
        if (!hasActiveFilters) {
            results = [];
            loading = false;
            error = null;
            cursor = null;
            hasMore = false;
            searchTimer = null;
            requestGeneration += 1;
            return;
        }

        loading = true;
        error = null;
        requestGeneration += 1; // invalida fetch em andamento da busca anterior
        searchTimer = setTimeout(() => {
            void fetchPage();
        }, 400);
    });

    function authorFor(result: SearchResult): UserSummary | undefined {
        return result.author_id ? usersStore.state.byId.get(result.author_id) : undefined;
    }

    function interactiveTarget(target: EventTarget | null): boolean {
        return !!(target as HTMLElement | null)?.closest(
            'button, a, input, select, textarea, video, audio, [role="slider"]'
        );
    }

    function close(): void {
        if (open) {
            open = false;
            onOpenChange?.(false);
            searchQuery = '';
            filters.author = '';
            filters.dateStart = '';
            filters.dateEnd = '';
            filters.order = 'desc';
            filters.containsAttachment = '';
            filters.channelId = '';
            filters.mention = '';
            filters.hasLink = false;
        }
    }

    $effect(() => {
        if (!open || results.length === 0) return;
        const ids = results.map((result) => result.author_id).filter((id): id is string => !!id);
        if (ids.length) void usersStore.ensureSummaries(ids).catch(() => {});
    });

    // Autofocus the input when the popover opens.
    $effect(() => {
        if (!open) return;
        queueMicrotask(() => {
            inputEl?.focus();
            inputEl?.select();
        });
    });

    // Close on outside click + Escape. Listeners only exist while open.
    $effect(() => {
        if (!open) return;

        function onPointerDown(e: PointerEvent): void {
            if (el && !el.contains(e.target as Node)) close();
        }

        function onKeyDown(e: KeyboardEvent): void {
            if (e.key === 'Escape' && document.activeElement !== inputEl) {
                close();
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

{#if open}
    <div class="header-popover search-popover open" bind:this={el}>
        <div class="popover-head search-popover-head">
            <div class="popover-title search-popover-title">
                <Icon name="magnifying-glass" variant="light" />
                <div class="search-title-copy">
                    <strong>Pesquisar</strong>
                    <span>Mensagens em todos os canais</span>
                </div>
            </div>

            <button class="popover-close" type="button" onclick={close} aria-label="Fechar pesquisa">
                <Icon name="x" variant="light" />
            </button>
        </div>

        <div class="popover-body search-popover-body" onscroll={onBodyScroll}>
            <div class="search-field">
                <span class="search-field-icon" aria-hidden="true">
                    <Icon name="magnifying-glass" variant="light" />
                </span>
                <input
                    class="admin-input search-input"
                    type="search"
                    placeholder="Pesquisar mensagens…"
                    bind:this={inputEl}
                    bind:value={searchQuery}
                    aria-label="Pesquisar mensagens"
                    autocomplete="off"
                    spellcheck="false"
                />
            </div>

            <div class="search-filter-panel" aria-label="Filtros de busca">
                <button
                    class="search-filter-heading"
                    type="button"
                    onclick={() => (filtersOpen = !filtersOpen)}
                    aria-expanded={filtersOpen}
                    aria-controls="search-filter-content"
                >
                    <span class="search-filter-heading-copy">
                        <strong>Filtros</strong>
                        <span>Opcionais</span>
                    </span>
                    <span class="search-filter-caret" class:open={filtersOpen} aria-hidden="true">
                        <Icon name="caret-down" variant="light" />
                    </span>
                </button>

                {#if filtersOpen}
                <div class="search-filter-grid" id="search-filter-content">
                    <label class="search-control">
                        <span>Ordem</span>
                        <select class="admin-select" bind:value={filters.order} aria-label="Ordem">
                            <option class="admin-option" value="desc">Mais recentes</option>
                            <option class="admin-option" value="asc">Mais antigas</option>
                        </select>
                    </label>

                    <label class="search-control">
                        <span>Anexos</span>
                        <select class="admin-select" bind:value={filters.containsAttachment} aria-label="Anexos">
                            <option class="admin-option" value="">Todos</option>
                            <option class="admin-option" value="with">Com anexo</option>
                            <option class="admin-option" value="without">Sem anexo</option>
                        </select>
                    </label>

                    <label class="search-control search-control-wide">
                        <span>Autor</span>
                        <input
                            class="admin-select"
                            list="search-author-options"
                            bind:value={filters.author}
                            placeholder="UUID ou usuário conhecido"
                            aria-label="Autor"
                        />
                    </label>

                    <label class="search-control search-control-wide">
                        <span>Canal</span>
                        <select class="admin-select" bind:value={filters.channelId} aria-label="Canal">
                            <option class="admin-option" value="">Todos os canais</option>
                            {#each channelOptions as channel (channel?.id)}
                                {#if channel}
                                    <option class="admin-option" value={channel.id}>#{channel.name}</option>
                                {/if}
                            {/each}
                        </select>
                    </label>

                    <label class="search-control search-control-wide">
                        <span>Menciona</span>
                        <input
                            class="admin-select"
                            list="search-author-options"
                            bind:value={filters.mention}
                            placeholder="UUID ou usuário conhecido"
                            aria-label="Usuário mencionado"
                        />
                    </label>

                    <label class="search-link-check">
                        <span>Contém Link</span>
                        <input type="checkbox" bind:checked={filters.hasLink} />
                    </label>

                    <label class="search-control">
                        <span>De</span>
                        <input class="admin-select" type="date" bind:value={filters.dateStart} aria-label="Data inicial" />
                    </label>

                    <label class="search-control">
                        <span>Até</span>
                        <input class="admin-select" type="date" bind:value={filters.dateEnd} aria-label="Data final" />
                    </label>
                </div>
                {/if}

                <datalist id="search-author-options">
                    {#each authorOptions as u (u.id)}
                        <option value={u.id}>{u.nickname || u.username}</option>
                    {/each}
                </datalist>
            </div>

            <div class="search-feedback" aria-live="polite">
                {#if loading && results.length === 0}
                    <div class="search-state">
                        <div class="popover-empty-icon search-loading-icon">
                            <Icon name="arrow-clockwise" variant="light" />
                        </div>
                        <div class="search-state-copy">
                            <strong>Pesquisando…</strong>
                            <p>Procurando mensagens que correspondam aos filtros.</p>
                        </div>
                    </div>
                {:else if error && results.length === 0}
                    <div class="search-state">
                        <div class="popover-empty-icon">
                            <Icon name="warning-circle" variant="light" />
                        </div>
                        <div class="search-state-copy">
                            <strong>Não foi possível pesquisar</strong>
                            <p>{error}</p>
                        </div>
                    </div>
                {:else if hasActiveFilters}
                    {#if results.length > 0}
                        <div class="search-results-head">
                            <span class="search-count">
                                {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
                            </span>
                            {#if hasMore}
                                <span class="search-results-hint">Role para ver mais</span>
                            {/if}
                        </div>

                        <div class="search-results">
                            {#each results as m (m.id)}
                                {@const a = authorFor(m)}
                                <div
                                    class="popover-item search-result"
                                    role="button"
                                    tabindex={0}
                                    onclick={(e) => {
                                        if (!interactiveTarget(e.target)) onResultClick?.(m);
                                    }}
                                    onkeydown={(e) => {
                                        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                                            e.preventDefault();
                                            onResultClick?.(m);
                                        }
                                    }}
                                >
                                    <Avatar user={a} userId={m.author_id} size={34} />
                                    <div class="search-result-main">
                                        <div class="meta search-result-meta">
                                            <span class="name">{a?.nickname || a?.username || m.author_username}</span>
                                            {#if m.channel_name}
                                                <span class="channel-name">{m.channel_name}</span>
                                            {/if}
                                            <span class="time">{formatTime(m.created_at)}</span>
                                        </div>
                                        {#if m.channel_id}
                                            {@const cachedMessage = messagesStore.getMessage(m.channel_id, m.id)}
                                            <div class="content search-message-content">
                                                <CompactMessageContent
                                                    content={m.content}
                                                    message={cachedMessage}
                                                    highlightText={searchQuery}
                                                />
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            {/each}
                        </div>

                        {#if loading}
                            <div class="search-inline-status">
                                <span class="search-inline-spinner" aria-hidden="true">
                                    <Icon name="arrow-clockwise" variant="light" />
                                </span>
                                Carregando mais…
                            </div>
                        {:else if error}
                            <div class="search-inline-status search-inline-error">{error}</div>
                        {/if}
                    {:else}
                        <div class="search-state">
                            <div class="popover-empty-icon">
                                <Icon name="magnifying-glass" variant="duotone" />
                            </div>
                            <div class="search-state-copy">
                                <strong>Nada encontrado</strong>
                                <p>Nenhuma mensagem corresponde aos filtros selecionados.</p>
                            </div>
                        </div>
                    {/if}
                {:else}
                    <div class="search-state search-state-idle">
                        <div class="popover-empty-icon">
                            <Icon name="magnifying-glass" variant="duotone" />
                        </div>
                        <div class="search-state-copy">
                            <strong>Encontre uma mensagem</strong>
                            <p>Digite um termo ou use autor, data e anexos como filtros independentes.</p>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .search-popover {
        width: min(440px, calc(100vw - 34px));
    }

    .search-popover-head {
        padding-block: 12px;
    }

    .search-popover-title {
        min-width: 0;
    }

    .search-title-copy {
        display: grid;
        min-width: 0;
        gap: 1px;
    }

    .search-title-copy > span {
        color: var(--muted);
        font-size: 11px;
        font-weight: 600;
        line-height: 1.25;
    }

    .search-popover-body {
        width: 100%;
        box-sizing: border-box;
        justify-items: stretch;
        gap: 12px;
        padding: 14px;
        max-height: min(590px, calc(100vh - 140px));
    }

    .search-field {
        position: relative;
        width: 100%;
    }

    .search-field-icon {
        position: absolute;
        z-index: 1;
        top: 50%;
        left: 14px;
        display: grid;
        place-items: center;
        color: var(--muted);
        pointer-events: none;
        transform: translateY(-50%);
    }

    .search-field-icon :global(i) {
        font-size: 16px;
    }

    .search-input {
        width: 100%;
        height: 48px;
        box-sizing: border-box;
        padding-left: 42px;
        padding-right: 14px;
    }

    .search-input::-webkit-search-cancel-button {
        opacity: 0.62;
        cursor: pointer;
    }

    .search-link-check {
        min-width: 0;
        min-height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 9px;
        padding: 0 2px;
        color: var(--muted);
        font-size: 10px;
        font-weight: 750;
        letter-spacing: 0.045em;
        line-height: 1;
        text-transform: uppercase;
        cursor: pointer;
    }

    .search-link-check input {
        width: 16px;
        height: 16px;
        margin: 0;
        accent-color: var(--accent);
        flex: none;
    }

    :global([data-theme='dark']) .search-link-check {
        color: var(--muted);
    }

    :global(html[data-ui-flat]) .search-link-check {
        background: transparent;
    }

    .search-filter-panel {
        display: grid;
        gap: 10px;
        padding: 11px;
        border: 1px solid rgba(255, 255, 255, 0.42);
        border-radius: 15px;
        background: rgba(255, 255, 255, 0.12);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
    }

    .search-filter-heading {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 2px;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
    }

    .search-filter-heading-copy {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }

    .search-filter-heading strong {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--muted);
    }

    .search-filter-heading-copy > span {
        font-size: 11px;
        color: var(--muted-soft);
    }

    .search-filter-caret {
        display: grid;
        place-items: center;
        flex: none;
        color: var(--muted-soft);
        transition: transform 160ms ease;
    }

    .search-filter-caret.open {
        transform: rotate(180deg);
    }

    .search-filter-caret :global(i) {
        font-size: 14px;
    }

    .search-filter-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 9px;
    }

    .search-control {
        display: grid;
        min-width: 0;
        gap: 5px;
    }

    .search-control > span {
        padding-left: 2px;
        color: var(--muted);
        font-size: 10px;
        font-weight: 750;
        letter-spacing: 0.045em;
        line-height: 1;
        text-transform: uppercase;
    }

    .search-control-wide {
        grid-column: 1 / -1;
    }

    .search-control .admin-select {
        width: 100%;
        min-width: 0;
        height: 40px;
        box-sizing: border-box;
        padding-inline: 10px;
        border-radius: 11px;
        font-size: 13px;
    }

    .search-feedback {
        width: 100%;
        min-width: 0;
    }

    .search-state {
        display: flex;
        align-items: center;
        width: 100%;
        min-height: 104px;
        box-sizing: border-box;
        gap: 12px;
        padding: 14px 8px;
    }

    .search-state-idle {
        min-height: 114px;
    }

    .search-state .popover-empty-icon {
        width: 42px;
        height: 42px;
        flex: none;
        border-radius: 13px;
    }

    .search-state-copy {
        display: grid;
        min-width: 0;
        gap: 3px;
    }

    .search-state-copy strong {
        font-size: 14px;
    }

    .search-state-copy p {
        max-width: none;
        font-size: 12px;
    }

    .search-loading-icon :global(i),
    .search-inline-spinner :global(i) {
        animation: search-spin 0.9s linear infinite;
    }

    @keyframes search-spin {
        to {
            transform: rotate(360deg);
        }
    }

    .search-results-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 1px 3px 7px;
    }

    .search-count {
        color: var(--muted);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    .search-results-hint {
        color: var(--muted-soft);
        font-size: 10px;
        white-space: nowrap;
    }

    .search-results {
        display: grid;
        gap: 3px;
    }

    .search-result {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        appearance: none;
        font: inherit;
        color: inherit;
        text-align: left;
        background: transparent;
    }

    .search-result:hover,
    .search-result:focus-visible {
        background: rgba(255, 255, 255, 0.22);
        border-color: rgba(255, 255, 255, 0.34);
    }

    .search-result:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px rgba(100, 196, 250, 0.13);
    }

    .search-result-main {
        flex: 1;
        min-width: 0;
    }

    .search-result-meta {
        display: flex;
        align-items: center;
        min-width: 0;
        gap: 6px;
        margin-bottom: 3px;
    }

    .search-result-meta .name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .search-result-meta .time {
        margin-left: auto;
        flex: none;
        white-space: nowrap;
    }

    .search-result .channel-name {
        max-width: 120px;
        overflow: hidden;
        padding: 2px 6px;
        border-radius: 999px;
        color: var(--link-muted);
        background: rgba(90, 190, 245, 0.1);
        font-size: 10px;
        font-weight: 700;
        line-height: 1.3;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .search-result .content {
        max-width: none;
        min-width: 0;
        color: var(--text);
        font-size: 12px;
        line-height: 1.42;
        overflow-wrap: anywhere;
    }

    .search-message-content mark {
        padding: 0 2px;
        border-radius: 4px;
        background: rgba(255, 210, 74, 0.46);
        color: var(--text-strong);
        font-weight: 800;
        box-decoration-break: clone;
        -webkit-box-decoration-break: clone;
    }

    :global([data-theme='dark']) .search-message-content mark {
        background: rgba(255, 193, 46, 0.28);
        color: #fff4c2;
    }

    .content-attachment {
        color: var(--muted-soft);
        font-style: italic;
    }

    .search-inline-status {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 10px 6px 2px;
        color: var(--muted);
        font-size: 11px;
    }

    .search-inline-spinner {
        display: grid;
        place-items: center;
    }

    .search-inline-error {
        color: var(--danger, #d94b63);
    }

    :global([data-theme='dark']) .search-filter-panel {
        border-color: rgba(182, 224, 250, 0.1);
        background: rgba(119, 194, 235, 0.045);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }

    :global(html[data-ui-flat]) .search-filter-panel {
        border-color: var(--border);
        background: var(--surface);
        box-shadow: none;
    }

    :global(html[data-ui-flat][data-theme='dark']) .search-filter-panel {
        background: #15384d;
    }

    :global([data-theme='dark']) .search-result:hover,
    :global([data-theme='dark']) .search-result:focus-visible {
        border-color: rgba(182, 224, 250, 0.11);
        background: rgba(119, 194, 235, 0.075);
    }

    :global([data-theme='dark']) .search-result .channel-name {
        background: rgba(119, 194, 235, 0.08);
    }

    @media (prefers-reduced-motion: reduce) {
        .search-filter-caret {
            transition: none;
        }
    }

    @media (max-width: 700px) {
        .search-popover {
            right: 8px;
            width: calc(100vw - 16px);
        }

        .search-popover-body {
            max-height: min(620px, calc(100vh - 116px));
            padding: 12px;
        }
    }

    @media (max-width: 390px) {
        .search-title-copy > span {
            display: none;
        }

        .search-filter-grid {
            gap: 8px;
        }

        .search-control .admin-select {
            padding-inline: 8px;
            font-size: 12px;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .search-loading-icon :global(i),
        .search-inline-spinner :global(i) {
            animation: none;
        }
    }
</style>
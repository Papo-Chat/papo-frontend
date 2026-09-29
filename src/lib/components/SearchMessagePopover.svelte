<script lang="ts">
	// Busca real (POST /search, debounced) sobre todos os canais legíveis.
	// Clique num resultado dispara onResultClick; a página decide destacar
	// localmente ou navegar (com scroll target).
	import { api } from '$lib/api';
	import * as usersStore from '$lib/store/users.svelte';
	import type { SearchRequest, SearchResult, UserSummary } from '$lib/types';
	import { formatTime } from '$lib/utils/time';
	import Icon from './Icon.svelte';
	import Avatar from './Avatar.svelte';

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
	}>({
		author: '',
		dateStart: '',
		dateEnd: '',
		order: 'desc',
		containsAttachment: ''
	});

	const authorOptions = $derived(usersStore.state.list.items);

	// Perfis dos autores dos resultados visíveis (batch, só ids ausentes do
	// cache) — nome/avatar/anel do autor no popover.
	$effect(() => {
		const ids = new Set<string>();
		for (const r of results) {
			if (r.author_id) ids.add(r.author_id);
		}
		void usersStore.ensureProfiles([...ids]);
	});

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
			return;
		}

		if (searchTimer) {
			clearTimeout(searchTimer);
		}

		const query = searchQuery.trim();

		// Sem termo: limpa a lista e não aciona request.
		if (!query) {
			results = [];
			loading = false;
			error = null;
			searchTimer = null;
			return;
		}

		loading = true;
		error = null;
		const generation = ++requestGeneration;
		searchTimer = setTimeout(async () => {
			try {
				// Envia somente os filtros definidos (o API exige >= 1 campo;
				// `text` sempre vem da query).
				const req: SearchRequest = { text: query };
				if (filters.author) {
					req.author = filters.author;
				}
				if (filters.dateStart) {
					req.date_start = filters.dateStart;
				}
				if (filters.dateEnd) {
					req.date_end = filters.dateEnd;
				}
				if (filters.order !== 'desc') {
					req.order = filters.order;
				}
				if (filters.containsAttachment === 'with') {
					req.contains_attachment = true;
				} else if (filters.containsAttachment === 'without') {
					req.contains_attachment = false;
				}
				const res = await api.search.search(req);
				if (generation === requestGeneration) {
					results = res.results;
				}
			} catch (e) {
				if (generation === requestGeneration) {
					error = (e as Error).message || 'Falha ao buscar mensagens.';
				}
			} finally {
				if (generation === requestGeneration) {
					loading = false;
				}
			}
		}, 400);
	});

	function authorFor(result: SearchResult): UserSummary | undefined {
		return result.author_id ? usersStore.state.byId.get(result.author_id) : undefined;
	}

	function onItemEnter(e: KeyboardEvent): void {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (e.currentTarget instanceof HTMLElement) {
				const r = e.currentTarget.dataset.resultId;
				const m = results.find((x) => x.id === r);
				if (m && onResultClick) onResultClick(m);
			}
		}
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
		}
	}

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
		<div class="popover-head">
			<div class="popover-title">
				<Icon name="magnifying-glass" variant="light" />
				<strong>Pesquisar</strong>
			</div>
			<button class="popover-close" on:click={close} aria-label="Fechar">
				<Icon name="x" variant="light" />
			</button>
		</div>

		<div class="popover-body">
			<input
				class="admin-input"
				type="text"
				placeholder="Pesquisar mensagens…"
				bind:this={inputEl}
				bind:value={searchQuery}
				aria-label="Pesquisar mensagens"
			/>

			<div class="search-filters" aria-label="Filtros de busca">
				<select class="admin-select" bind:value={filters.order} aria-label="Ordem">
					<option class="admin-option" value="desc">Mais recentes</option>
					<option class="admin-option" value="asc">Mais antigas</option>
				</select>

				<select class="admin-select" bind:value={filters.containsAttachment} aria-label="Anexos">
					<option class="admin-option" value="">Anexos: todos</option>
					<option class="admin-option" value="with">Anexos: com</option>
					<option class="admin-option" value="without">Anexos: sem</option>
				</select>

				{#if authorOptions.length}
					<select class="admin-select" bind:value={filters.author} aria-label="Autor">
						<option class="admin-option" value="">Autor: todos</option>
						{#each authorOptions as u (u.id)}
							<option class="admin-option" value={u.id}>Autor: {u.nickname || u.username}</option>
						{/each}
					</select>
				{/if}

				<input class="admin-select" type="date" bind:value={filters.dateStart} aria-label="De" />
				<input class="admin-select" type="date" bind:value={filters.dateEnd} aria-label="Até" />
			</div>

			{#if loading}
				<div class="popover-empty">
					<div class="popover-empty-icon">
						<Icon name="arrow-clockwise" variant="light" />
					</div>
					<strong>Pesquisando…</strong>
				</div>
			{:else if error}
				<div class="popover-empty">
					<div class="popover-empty-icon">
						<Icon name="warning-circle" variant="light" />
					</div>
					<strong>{error}</strong>
				</div>
			{:else if searchQuery.trim()}
				{#if results.length > 0}
					<div class="search-count">
						{results.length}
						{results.length === 1 ? 'resultado' : 'resultados'}
					</div>
					{#each results as m (m.id)}
						{@const a = authorFor(m)}
						<div
							class="popover-item"
							on:click={() => onResultClick?.(m)}
							on:keydown={onItemEnter}
							role="button"
							tabindex={0}
							data-result-id={m.id}
						>
							<Avatar user={a} size={34} />
							<div>
								<div class="meta">
									<span class="name">{a?.nickname || a?.username || m.author_username}</span>
									<span class="time">{formatTime(m.created_at)}</span>
									{#if m.channel_name}
										<span class="channel-name">{m.channel_name}</span>
									{/if}
								</div>
								{#if m.content}
									<div class="content">{m.content}</div>
								{:else}
									<div class="content"><span class="content-attachment">Anexo</span></div>
								{/if}
							</div>
						</div>
					{/each}
				{:else}
					<div class="popover-empty">
						<div class="popover-empty-icon">
							<Icon name="magnifying-glass" variant="duotone" />
						</div>
						<strong>Nada encontrado</strong>
						<p>Nenhuma mensagem contém “{searchQuery.trim()}”.</p>
					</div>
				{/if}
			{:else}
				<div class="popover-empty">
					<div class="popover-empty-icon">
						<Icon name="magnifying-glass" variant="duotone" />
					</div>
					<strong>Pesquisar</strong>
					<p>Digite um termo para encontrar mensagens.</p>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.search-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 8px;
		align-items: center;
	}
	.search-count {
		display: block;
		margin: 10px 2px 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.popover-item .channel-name {
		font-size: 12px;
		color: var(--muted-soft);
		margin-left: 4px;
	}
	.content-attachment {
		font-style: italic;
		color: var(--muted-soft);
	}
</style>

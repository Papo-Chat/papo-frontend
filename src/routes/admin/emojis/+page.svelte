<script lang="ts">
	import * as emojisStore from '$lib/store/emojis.svelte';
	import { fileToBase64 } from '$lib/utils/upload';
	import { mimeToFormat } from '$lib/utils/media';
	import Icon from '$lib/components/Icon.svelte';

	let creating = $state(false);
	let name = $state('');
	let selectedFile: File | null = $state(null);
	let filter = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);

	const emojis = $derived(emojisStore.state.list);
	const visibleEmojis = $derived(
		filter ? emojis.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase())) : emojis
	);

	$effect(() => {
		if (!emojisStore.state.loaded && !emojisStore.state.loading) emojisStore.load();
	});

	function onFileSelect(e: Event): void {
		selectedFile = (e.target as HTMLInputElement).files?.[0] ?? null;
		error = null;
	}

	async function add(): Promise<void> {
		const n = name.trim();
		if (!n || !selectedFile || saving) return;
		saving = true;
		error = null;
		try {
			const image = await fileToBase64(selectedFile, 'emoji');
			await emojisStore.create({
				name: n,
				format: mimeToFormat(image.mime),
				image_blob: image.base64
			});
			name = '';
			selectedFile = null;
			creating = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao criar emoji.';
		} finally {
			saving = false;
		}
	}

	async function remove(id: string): Promise<void> {
		if (saving) return;
		error = null;
		try {
			await emojisStore.remove(id);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao remover emoji.';
		}
	}

	function onGridScroll(e: Event): void {
		const sc = e.target as HTMLElement;
		const distance = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
		if (distance < 180 && emojisStore.state.hasMore && !emojisStore.state.loading) {
			emojisStore.loadMore();
		}
	}
</script>

<div class="emojis-page">
	<header class="emojis-head">
		<h2>Emojis</h2>
		<div class="emojis-actions">
			<input
				class="admin-input filter-input"
				placeholder="Filtrar emojis…"
				bind:value={filter}
				aria-label="Filtrar emojis"
			/>
			<button class="admin-btn" onclick={() => (creating = !creating)}>
				<Icon name="plus" variant="light" />
				Novo emoji
			</button>
		</div>
	</header>

	{#if error}
		<div class="emoji-error" role="alert">{error}</div>
	{/if}

	{#if creating}
		<div class="new-emoji">
			<input
				class="admin-input"
				placeholder="nome do emoji"
				bind:value={name}
				aria-label="Nome do emoji"
			/>
			<input
				class="emoji-file"
				type="file"
				accept="image/gif,image/jpeg,image/png,image/webp"
				onchange={onFileSelect}
				aria-label="Imagem do emoji"
			/>
			<button class="admin-btn" onclick={add} disabled={saving || !name.trim() || !selectedFile}>
				{saving ? 'Criando…' : 'Criar'}
			</button>
			<button class="admin-btn ghost" onclick={() => (creating = false)} disabled={saving}>
				Cancelar
			</button>
		</div>
	{/if}

	<div class="admin-card emoji-card">
		<div class="admin-card-head">
			<Icon name="smiley" variant="duotone" size={16} />
			Emojis ({emojis.length})
		</div>
		<div class="admin-card-body emoji-list" onscroll={onGridScroll}>
			{#if emojisStore.state.loading && emojis.length === 0}
				<div class="empty">Carregando emojis…</div>
			{:else if visibleEmojis.length === 0}
				<div class="empty">Nenhum emoji encontrado.</div>
			{:else}
				<div class="emoji-grid">
					{#each visibleEmojis as e (e.id)}
						<div class="emoji-cell">
							<div class="emoji-swatch" aria-hidden="true">
								{#if emojisStore.emojiUrl(e)}
									<img src={emojisStore.emojiUrl(e)} alt="" />
								{:else}
									{e.name[0]?.toUpperCase()}
								{/if}
							</div>
							<div class="emoji-info">
								<span class="emoji-name">:{e.name}:</span>
								<span class="emoji-meta">
									{e.format}
									{#if e.created_by}
										· {e.created_by.slice(0, 8)}
									{/if}
								</span>
							</div>
							<button
								class="emoji-remove"
								aria-label={`Remover emoji ${e.name}`}
								onclick={() => void remove(e.id)}
							>
								<Icon name="trash" variant="light" size={14} />
							</button>
						</div>
					{/each}
				</div>
				{#if emojisStore.state.loading}
					<div class="loading-more">Carregando mais…</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.emojis-page { padding:4px 0 8px; height:100%; display:flex; flex-direction:column; }
	.emojis-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:12px; }
	.emojis-head h2 { margin:0; font-size:20px; }
	.emojis-actions, .new-emoji { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
	.emojis-actions .filter-input { width:150px; }
	.new-emoji { margin-bottom:12px; }
	.new-emoji .admin-input { min-width:180px; }
	.emoji-file { max-width:260px; color:var(--muted); font-size:12px; }
	.emoji-card { flex:1; min-height:0; display:flex; flex-direction:column; }
	.emoji-list { flex:1; min-height:0; overflow-y:auto; }
	.emoji-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:12px; width:100%; }
	.emoji-cell { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:12px; background:rgba(255,255,255,.32); border:1px solid rgba(255,255,255,.42); }
	.emoji-swatch { flex:none; width:42px; height:42px; border-radius:10px; display:grid; place-items:center; overflow:hidden; background:linear-gradient(135deg,#7a28ce,#3a86ff); color:#fff; }
	.emoji-swatch img { width:34px; height:34px; object-fit:contain; }
	.emoji-info { flex:1; display:flex; flex-direction:column; min-width:0; gap:2px; }
	.emoji-name { font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.emoji-meta { font-size:10px; color:var(--muted-soft); }
	.emoji-remove { flex:none; display:grid; place-items:center; width:30px; height:30px; border:0; border-radius:8px; background:transparent; color:var(--text); cursor:pointer; opacity:.55; }
	.emoji-remove:hover { opacity:1; background:rgba(240,61,94,.14); color:#f03d5e; }
	.empty, .loading-more { padding:18px; color:var(--muted-soft); font-size:13px; text-align:center; }
	.emoji-error { margin-bottom:10px; padding:8px 12px; border-radius:10px; background:rgba(220,40,40,.1); color:#c43a46; font-size:12px; }
	:global([data-theme='dark']) .emoji-cell { background:rgba(119,194,235,.06); border-color:rgba(182,224,250,.14); }
</style>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { ApiError } from '$lib/api';
	import { state as uiState, openProfile } from '$lib/store/ui.svelte';
	import { meId } from '$lib/store/session.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import * as dmsStore from '$lib/store/dms.svelte';
	import * as blocksStore from '$lib/store/blocks.svelte';
	import type { UserSummary } from '$lib/types';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	let searchQuery = $state('');
	let openingUserId: string | null = $state(null);
	let error: string | null = $state(null);

	const me = $derived(meId());
	const users = $derived.by(() => {
		const map = new Map<string, UserSummary>();
		for (const user of usersStore.state.list.items) {
			if (user.id !== me && !user.banned && !usersStore.state.bannedIds.has(user.id)) map.set(user.id, user);
		}
		for (const id of usersStore.state.presence.keys()) {
			const user = usersStore.state.byId.get(id);
			if (user && user.id !== me && !user.banned && !usersStore.state.bannedIds.has(user.id)) map.set(user.id, user);
		}
		return [...map.values()];
	});

	const filtered = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		const list = q
			? users.filter((user) => (user.nickname || user.username).toLowerCase().includes(q))
			: users;
		const rank = { online: 0, away: 1, busy: 2, offline: 3 } as const;
		return [...list].sort((a, b) => {
			const sa = usersStore.effectiveStatus(a.id);
			const sb = usersStore.effectiveStatus(b.id);
			const status = rank[sa] - rank[sb];
			return status || (a.nickname || a.username).localeCompare(b.nickname || b.username);
		});
	});

	$effect(() => {
		if (usersStore.state.list.items.length === 0 && !usersStore.state.list.loading) {
			void usersStore.loadList();
		}
	});

	function close(): void {
		uiState.dmDirectoryOpen = false;
	}

	function onScroll(event: Event): void {
		const el = event.currentTarget as HTMLElement;
		const bottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		if (bottom < 180 && usersStore.state.list.hasMoreNext && !usersStore.state.list.loading) {
			void usersStore.loadMore();
		}
	}

	async function openDm(user: UserSummary): Promise<void> {
		if (openingUserId || blocksStore.isBlocked(user.id)) return;
		openingUserId = user.id;
		error = null;
		try {
			const dm = await dmsStore.openWithUser(user.id);
			close();
			uiState.railDrawerOpen = false;
			await goto(`/dm/${dm.id}`);
		} catch (err) {
			if (err instanceof ApiError) {
				const echoNotFound =
					err.type === 'about:blank' &&
					err.message.trim().toLowerCase() === 'not found';
				error = echoNotFound
					? 'O endpoint de mensagens diretas não está disponível neste backend.'
					: err.detail || err.message || 'Não foi possível abrir a conversa.';
			} else {
				error = err instanceof Error ? err.message : 'Não foi possível abrir a conversa.';
			}
		} finally {
			openingUserId = null;
		}
	}

	$effect(() => {
		function onKeydown(event: KeyboardEvent): void {
			if (event.key === 'Escape') close();
		}
		document.addEventListener('keydown', onKeydown);
		return () => document.removeEventListener('keydown', onKeydown);
	});
</script>

<aside class="member-directory" aria-label="Membros">
	<header class="member-directory-head">
		<div>
			<span class="member-directory-eyebrow">Comunidade</span>
			<strong>Membros</strong>
		</div>
		<button class="directory-close" type="button" onclick={close} aria-label="Fechar membros">
			<Icon name="x" variant="light" />
		</button>
	</header>

	<label class="directory-search">
		<Icon name="magnifying-glass" variant="light" size={16} />
		<input bind:value={searchQuery} type="search" placeholder="Procurar membros…" aria-label="Procurar membros" />
	</label>

	{#if error}
		<div class="directory-error" role="alert">{error}</div>
	{/if}

	<div class="directory-list" onscroll={onScroll}>
		{#if filtered.length === 0 && !usersStore.state.list.loading}
			<div class="directory-empty">Nenhum membro encontrado.</div>
		{/if}
		{#each filtered as user (user.id)}
			{@const status = usersStore.effectiveStatus(user.id)}
			{@const blocked = blocksStore.isBlocked(user.id)}
			<div class="directory-row">
				<button
					class="directory-main"
					type="button"
					disabled={blocked || openingUserId === user.id}
					onclick={() => void openDm(user)}
					aria-label={blocked ? `${user.nickname || user.username} está bloqueado` : `Conversar com ${user.nickname || user.username}`}
				>
					<span class="directory-avatar">
						<Avatar {user} size={36} />
						<span class="directory-status {status}" aria-hidden="true"></span>
					</span>
					<span class="directory-copy">
						<strong>{user.nickname || user.username}</strong>
						<small>{blocked ? 'Bloqueado' : status === 'online' ? 'Online' : status === 'away' ? 'Ausente' : status === 'busy' ? 'Ocupado' : 'Offline'}</small>
					</span>
					{#if openingUserId === user.id}
						<Icon name="spinner-gap" variant="light" />
					{:else if !blocked}
						<Icon name="chat-circle-text" variant="light" />
					{/if}
				</button>
				<button
					class="directory-profile"
					type="button"
					onclick={() => openProfile(user)}
					aria-label={`Ver perfil de ${user.nickname || user.username}`}
					title="Ver perfil"
				>
					<Icon name="user" variant="light" size={16} />
				</button>
			</div>
		{/each}
		{#if usersStore.state.list.loading}
			<div class="directory-loading">Carregando…</div>
		{/if}
	</div>
</aside>

<style>
	.member-directory {
		position: absolute;
		top: 12px;
		right: 12px;
		bottom: 12px;
		z-index: 140;
		width: min(340px, calc(100% - 96px));
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr);
		gap: 12px;
		padding: 14px;
		box-sizing: border-box;
		border-radius: 20px;
		border: 1px solid rgba(255, 255, 255, 0.66);
		background: linear-gradient(145deg, rgba(246, 252, 255, 0.93), rgba(211, 236, 249, 0.9));
		box-shadow: 0 20px 48px rgba(10, 55, 86, 0.24), inset 0 1px 0 rgba(255,255,255,.9);
		backdrop-filter: blur(22px) saturate(135%);
		-webkit-backdrop-filter: blur(22px) saturate(135%);
	}
	.member-directory-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.member-directory-head > div { display: grid; gap: 2px; }
	.member-directory-head strong { font-size: 17px; }
	.member-directory-eyebrow {
		color: var(--muted-soft);
		font-size: 10px;
		font-weight: 800;
		letter-spacing: .08em;
		text-transform: uppercase;
	}
	.directory-close,
	.directory-profile {
		display: grid;
		place-items: center;
		border: 1px solid var(--border);
		background: rgba(255,255,255,.35);
		color: var(--text);
		cursor: pointer;
	}
	.directory-close { width: 34px; height: 34px; border-radius: 50%; }
	.directory-search {
		height: 42px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 11px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: rgba(255,255,255,.34);
		color: var(--muted-soft);
	}
	.directory-search input {
		width: 100%;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 13px;
	}
	.directory-list {
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: none;
		display: grid;
		align-content: start;
		gap: 5px;
	}
	.directory-list::-webkit-scrollbar { display: none; }
	.directory-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 34px;
		align-items: center;
		gap: 6px;
	}
	.directory-main {
		min-width: 0;
		min-height: 54px;
		display: grid;
		grid-template-columns: 40px minmax(0,1fr) 18px;
		align-items: center;
		gap: 9px;
		padding: 6px 9px;
		border: 1px solid transparent;
		border-radius: 13px;
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.directory-main:hover:not(:disabled),
	.directory-main:focus-visible {
		background: rgba(255,255,255,.4);
		border-color: rgba(107,171,208,.2);
		outline: none;
	}
	.directory-main:disabled { cursor: default; opacity: .62; }
	.directory-avatar { position: relative; width: 36px; height: 36px; }
	.directory-status {
		position: absolute;
		right: -2px;
		bottom: -2px;
		width: 10px;
		height: 10px;
		border: 2px solid rgba(232,246,253,.96);
		border-radius: 50%;
		background: #7f95a5;
	}
	.directory-status.online { background:#24c982; }
	.directory-status.away { background:#e7a80b; }
	.directory-status.busy { background:#f03d5e; }
	.directory-copy { min-width: 0; display: grid; gap: 2px; }
	.directory-copy strong,
	.directory-copy small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.directory-copy strong { font-size: 13px; }
	.directory-copy small { font-size: 10px; color: var(--muted-soft); }
	.directory-profile { width:34px; height:34px; border-radius:11px; }
	.directory-error {
		padding: 8px 10px;
		border-radius: 10px;
		background: rgba(220,40,40,.1);
		color: var(--danger, #c43a46);
		font-size: 11px;
	}
	.directory-empty,
	.directory-loading { padding: 18px 8px; text-align:center; color:var(--muted-soft); font-size:12px; }

	:global([data-theme='dark']) .member-directory {
		border-color: rgba(181,222,248,.14);
		background: linear-gradient(145deg, rgba(32,61,79,.96), rgba(11,36,52,.94));
		box-shadow: 0 20px 48px rgba(0,0,0,.36), inset 0 1px 0 rgba(255,255,255,.07);
	}
	:global([data-theme='dark']) .directory-search,
	:global([data-theme='dark']) .directory-close,
	:global([data-theme='dark']) .directory-profile { background: rgba(255,255,255,.06); }
	:global([data-theme='dark']) .directory-main:hover:not(:disabled) { background: rgba(96,165,204,.12); }
	:global([data-theme='dark']) .directory-status { border-color: rgba(22,48,64,.98); }
	:global(html[data-ui-flat]) .member-directory {
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		background: linear-gradient(145deg, rgba(246,252,255,.99), rgba(216,239,250,.99));
	}
	:global(html[data-ui-flat][data-theme='dark']) .member-directory {
		background: linear-gradient(145deg, rgba(29,58,76,.99), rgba(10,34,49,.99));
	}
	:global(html[data-ui-mobile]) .directory-main:hover { transform: none; }

	@media (max-width: 700px) {
		.member-directory {
			top: 8px;
			right: 8px;
			bottom: 8px;
			width: calc(100% - 16px);
			max-width: 360px;
			border-radius: 18px;
		}
	}
</style>

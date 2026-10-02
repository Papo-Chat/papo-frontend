<script lang="ts">
	import * as blocksStore from '$lib/store/blocks.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let pending = $state(new Set<string>());
	let error: string | null = $state(null);

	$effect(() => {
		if (!blocksStore.state.loaded && !blocksStore.state.loading) {
			void blocksStore.load().catch((err) => {
				error = err instanceof Error ? err.message : 'Não foi possível carregar os usuários bloqueados.';
			});
		}
	});

	async function unblock(userId: string): Promise<void> {
		if (pending.has(userId)) return;
		pending = new Set([...pending, userId]);
		error = null;
		try {
			await blocksStore.unblock(userId);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Não foi possível desbloquear o usuário.';
		} finally {
			const next = new Set(pending);
			next.delete(userId);
			pending = next;
		}
	}
</script>

<div class="blocked-page">
	<div class="admin-card">
		<div class="admin-card-head">
			<div class="blocked-title">
				<Icon name="user-minus" variant="duotone" size={17} />
				<div>
					<strong>Usuários bloqueados</strong>
					<span>O bloqueio vale apenas para mensagens diretas.</span>
				</div>
			</div>
		</div>

		{#if error}
			<div class="blocked-error" role="alert">{error}</div>
		{/if}

		<div class="admin-card-body blocked-list">
			{#if blocksStore.state.loading && !blocksStore.state.loaded}
				<div class="blocked-empty">Carregando…</div>
			{:else if blocksStore.state.users.length === 0}
				<div class="blocked-empty">
					<Icon name="users" variant="light" size={22} />
					<span>Nenhum usuário bloqueado.</span>
				</div>
			{:else}
				{#each blocksStore.state.users as user (user.id)}
					<div class="blocked-row">
						<Avatar {user} size={38} />
						<div class="blocked-copy">
							<strong>{user.nickname || user.username}</strong>
							<span>@{user.username}</span>
						</div>
						<button
							class="admin-btn"
							type="button"
							disabled={pending.has(user.id)}
							onclick={() => void unblock(user.id)}
						>
							{pending.has(user.id) ? 'Desbloqueando…' : 'Desbloquear'}
						</button>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

<style>
	.blocked-page {
		padding: 4px 0 8px;
	}

	.blocked-title {
		display: flex;
		align-items: center;
		gap: 9px;
	}

	.blocked-title > div {
		display: grid;
		gap: 2px;
	}

	.blocked-title span {
		color: var(--muted-soft);
		font-size: 10px;
		font-weight: 500;
	}

	.blocked-list {
		display: grid;
		gap: 5px;
	}

	.blocked-row {
		min-width: 0;
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		padding: 9px;
		border-radius: 12px;
		border: 1px solid transparent;
	}

	.blocked-row:hover {
		background: rgba(255, 255, 255, 0.22);
		border-color: rgba(96, 156, 193, 0.12);
	}

	.blocked-copy {
		min-width: 0;
		display: grid;
		gap: 2px;
	}

	.blocked-copy strong,
	.blocked-copy span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.blocked-copy strong {
		font-size: 13px;
	}

	.blocked-copy span {
		color: var(--muted-soft);
		font-size: 10px;
	}

	.blocked-error {
		margin: 0 14px 8px;
		padding: 8px 10px;
		border-radius: 10px;
		background: rgba(220, 40, 40, 0.1);
		color: #c43a46;
		font-size: 11px;
	}

	.blocked-empty {
		min-height: 120px;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 8px;
		color: var(--muted-soft);
		font-size: 12px;
	}

	:global([data-theme='dark']) .blocked-row:hover {
		background: rgba(94, 169, 211, 0.08);
		border-color: rgba(181, 222, 248, 0.08);
	}

	:global(html[data-ui-mobile]) .blocked-row:hover {
		background: transparent;
		border-color: transparent;
	}

	@media (max-width: 520px) {
		.blocked-row {
			grid-template-columns: 42px minmax(0, 1fr);
		}

		.blocked-row .admin-btn {
			grid-column: 1 / -1;
			justify-self: stretch;
			justify-content: center;
		}
	}
</style>

<script lang="ts">
	// Roles: list + create. Data: rolesStore (roles) + usersStore (member counts).
	import * as rolesStore from '$lib/store/roles.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import type { Role, RolePermissions } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let creating = $state(false);
	let name = $state('');
	let color = $state('#9b5de5');
	let filter = $state('');
	let saving = $state(false);
	let success = $state('');
	let error = $state<string | null>(null);
	let feedbackTimer: ReturnType<typeof setTimeout> | null = null;


	const visibleRoles = $derived(
		rolesStore.state.list.filter(
			(r) => !filter || r.name.toLowerCase().includes(filter.toLowerCase())
		)
	);

	function memberCount(roleId: string): number {
		let count = 0;
		for (const u of usersStore.state.byId.values()) {
			if (u.roles.some((r) => r.id === roleId)) count++;
		}
		return count;
	}

	function openCreate(): void {
		creating = true;
		name = '';
		color = '#9b5de5';
	}

	function closeCreate(): void {
		creating = false;
	}

	async function create(): Promise<void> {
		const n = name.trim();
		if (!n || saving) return;
		saving = true;
		error = null;
		success = '';
		try {
			await rolesStore.create({
				name: n,
				color,
				permissions: {
					manage_server: false,
					manage_channels: false,
					manage_roles: false,
					ban_members: false,
					pin_message: false,
					everyone_message: false,
					send_attachment: false
				}
			});
			closeCreate();
			success = 'Role criado.';
			if (feedbackTimer) clearTimeout(feedbackTimer);
			feedbackTimer = setTimeout(() => (success = ''), 1800);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Erro ao criar Role.';
		} finally {
			saving = false;
		}
	}
</script>

<div class="roles-page">
	<header class="roles-head">
		<h2>Roles</h2>
		<div class="roles-actions">
			<input
				class="admin-input filter-input"
				placeholder="Filtrar Roles…"
				bind:value={filter}
				aria-label="Filtrar Roles"
			/>
			<button class="admin-btn" onclick={openCreate}>
				<Icon name="plus" variant="light" />
				Novo Role
			</button>
		</div>
	</header>

	{#if error}
		<div class="role-feedback error" role="alert">{error}</div>
	{:else if success}
		<div class="role-feedback success" aria-live="polite">{success}</div>
	{/if}

	{#if creating}
		<div class="new-role">
			<input
				class="admin-input"
				placeholder="Nome do Role"
				bind:value={name}
				aria-label="Nome do Role"
			/>
			<div class="color-pick">
				<input class="color-input" type="color" bind:value={color} aria-label="Cor do Role" />
				<input class="admin-input color-hex" bind:value={color} maxlength="7" aria-label="Cor hexadecimal" />
			</div>
			<button class="admin-btn" onclick={create} disabled={saving || !name.trim()}>
				{saving ? 'Criando…' : 'Criar'}
			</button>
			<button class="admin-btn ghost" onclick={closeCreate} disabled={saving}>Cancelar</button>
		</div>
	{/if}

	<div class="admin-card">
		<div class="admin-card-head">
			<Icon name="shield-check" variant="duotone" size={16} />
			Lista
		</div>
		<div class="admin-card-body">
			<table class="admin-table">
				<thead>
					<tr>
						<th>Role</th>
						<th>Cor</th>
						<th>Membros</th>
						<th>Ações</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleRoles as r (r.id)}
						<tr>
							<td>
								<a class="role-link" href={`/admin/roles/${r.id}`} title="Editar Role">
									<span class="chip" style="color:{r.color}">{r.name}</span>
								</a>
							</td>
							<td>
								<span class="swatch" style="background:{r.color}" aria-hidden="true"></span>
							</td>
							<td>{memberCount(r.id)}</td>
							<td>
								<a class="admin-btn ghost small" href={`/admin/roles/${r.id}`}>
									<Icon name="wrench" variant="light" size={14} />
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

<style>
	.roles-page {
		padding: 4px 0 8px;
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.roles-page > .admin-card {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.roles-page > .admin-card .admin-card-body {
		flex: 1;
		min-height: 0;
	}
	.roles-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 12px;
	}
	.roles-head h2 {
		margin: 0;
		font-size: 20px;
	}
	.roles-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.roles-actions .filter-input {
		width: 150px;
	}
	.new-role {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}
	.new-role .admin-input {
		flex: 1;
		min-width: 180px;
	}
	.color-pick { display:flex; gap:6px; align-items:center; }
	.color-input { width:38px; height:34px; padding:2px; border:0; background:transparent; cursor:pointer; }
	.color-hex { width:92px !important; min-width:92px !important; }
	.swatch {
		width: 22px;
		height: 22px;
		border-radius: 7px;
		border: 2px solid transparent;
		cursor: pointer;
		background: transparent;
	}
	.color-pick .swatch {
		border-color: rgba(255, 255, 255, 0.5);
	}
	.swatch.active {
		border-color: #fff;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18);
	}
	.role-link {
		display: inline-block;
	}
	.role-link:hover .chip {
		transform: translateY(-1px);
	}
	.chip {
		transition: transform 0.14s var(--ease);
	}
	.role-feedback {
		margin-bottom: 10px;
		padding: 8px 12px;
		border-radius: 10px;
		font-size: 12px;
	}
	.role-feedback.success {
		background: rgba(36, 201, 130, 0.1);
		color: #199966;
	}
	.role-feedback.error {
		background: rgba(220, 40, 40, 0.1);
		color: #c43a46;
	}

	.admin-btn.ghost.small {
		height: 32px;
		padding: 0 10px;
		font-size: 12px;
	}
</style>

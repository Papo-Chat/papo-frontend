<script lang="ts">
	// Roles: list + create. Demo only — no API wiring.
	import { sampleRoles, sampleUsers } from '$lib/sample';
	import type { Role, RolePermissions } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let creating = $state(false);
	let name = $state('');
	let color = $state('#9b5de5');
	let filter = $state('');

	const palette = ['#e7a80b', '#30d158', '#0a84ff', '#9b5de5', '#ff5d63', '#5ac8fa'];

	const visibleRoles = $derived(
		filter
			? sampleRoles.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
			: sampleRoles
	);

	function memberCount(roleId: string): number {
		return sampleUsers.filter((u) => u.roles.some((r) => r.id === roleId)).length;
	}

	function openCreate(): void {
		creating = true;
		name = '';
		color = palette[0];
	}

	function closeCreate(): void {
		creating = false;
	}

	function create(): void {
		// Demo: no API.
		closeCreate();
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

	{#if creating}
		<div class="new-role">
			<input
				class="admin-input"
				placeholder="Nome do Role"
				bind:value={name}
				aria-label="Nome do Role"
			/>
			<div class="color-pick">
				{#each palette as c (c)}
					<button
						class="swatch {color === c ? 'active' : ''}"
						style:background-color={c}
						aria-label={`Cor ${c}`}
						onclick={() => (color = c)}
					></button>
				{/each}
			</div>
			<button class="admin-btn" onclick={create}>Criar</button>
			<button class="admin-btn ghost" onclick={closeCreate}>Cancelar</button>
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
								<span
									class="swatch"
									style="background:{r.color}"
									aria-hidden="true"
								></span>
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
	.roles-page{
		padding: 4px 0 8px;
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.roles-page > .admin-card{
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.roles-page > .admin-card .admin-card-body{
		flex: 1;
		min-height: 0;
	}
	.roles-head{
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 12px;
	}
	.roles-head h2{
		margin: 0;
		font-size: 20px;
	}
	.roles-actions{
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.roles-actions .filter-input{
		width: 150px;
	}
	.new-role{
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}
	.new-role .admin-input{
		flex: 1;
		min-width: 180px;
	}
	.color-pick{
		display: flex;
		gap: 6px;
	}
	.swatch{
		width: 22px;
		height: 22px;
		border-radius: 7px;
		border: 2px solid transparent;
		cursor: pointer;
		background: transparent;
	}
	.color-pick .swatch{
		border-color: rgba(255, 255, 255, 0.5);
	}
	.swatch.active{
		border-color: #fff;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18);
	}
	.role-link{
		display: inline-block;
	}
	.role-link:hover .chip{
		transform: translateY(-1px);
	}
	.chip{
		transition: transform 0.14s var(--ease);
	}
	.admin-btn.ghost.small{
		height: 32px;
		padding: 0 10px;
		font-size: 12px;
	}
</style>

<script lang="ts">
	// Role edit + permissions. Demo only — no API wiring.
	import { page } from '$app/state';
	import { roleById } from '$lib/sample';
	import type { Role, RolePermissions } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let roleId = $derived(page.params.role_id ?? '');
	let role: Role | null = $derived(roleById(roleId));

	// Local editable copy of the role's permissions.
	let perms = $state<RolePermissions>({
		manage_server: false,
		manage_channels: false,
		manage_roles: false,
		ban_members: false,
		pin_message: false,
		everyone_message: false,
		send_attachment: false
	});
	let name = $state('');
	let color = $state('#9b5de5');

	const palette = ['#e7a80b', '#30d158', '#0a84ff', '#9b5de5', '#ff5d63', '#5ac8fa'];

	$effect(() => {
		if (role) {
			name = role.name;
			color = role.color ?? '#9b5de5';
			perms = { ...role.permissions };
		}
	});

	const PERMS = [
		{ key: 'manage_server' as const, label: 'Gerenciar servidor' },
		{ key: 'manage_channels' as const, label: 'Gerenciar canais' },
		{ key: 'manage_roles' as const, label: 'Gerenciar Roles' },
		{ key: 'ban_members' as const, label: 'Expulsar membros' },
		{ key: 'pin_message' as const, label: 'Fixar mensagens' },
		{ key: 'everyone_message' as const, label: 'Mensagem para todos' },
		{ key: 'send_attachment' as const, label: 'Enviar anexos' }
	];

	function save(): void {
		// Demo: no API.
	}
</script>

<div class="role-edit-page">
	{#if role}
		<header class="role-head">
			<a class="admin-back" href="/admin/roles" aria-label="Voltar aos Roles">
				<Icon name="arrow-left" variant="light" />
				Voltar
			</a>
			<h2>{name || role.name}</h2>
		</header>

		<div class="admin-grid-2 role-grid">
			<div class="admin-card">
				<div class="admin-card-head">
					<Icon name="shield-check" variant="duotone" size={16} />
					Dados
				</div>
				<div class="admin-card-body">
					<div class="admin-field">
						<label for="rl-name">Nome</label>
						<input id="rl-name" class="admin-input" bind:value={name} />
					</div>
					<div class="admin-field">
						<label>Cor</label>
						<div class="color-pick">
							{#each palette as c (c)}
								<button
									class="swatch {color === c ? 'active' : ''}"
									style="background:{c}"
									aria-label={`Cor ${c}`}
									onclick={() => (color = c)}
								></button>
							{/each}
						</div>
					</div>
					<div class="admin-stat">
						<span>Criado</span>
						<strong>{role.created_at}</strong>
					</div>
				</div>
			</div>

			<div class="admin-card">
				<div class="admin-card-head">
					<Icon name="check-square" variant="duotone" size={16} />
					Permissões
				</div>
				<div class="admin-card-body">
					{#each PERMS as p (p.key)}
						<label class="admin-checkbox">
							<input type="checkbox" bind:checked={perms[p.key]} aria-label={p.label} />
							<div>
								<strong>{p.label}</strong>
							</div>
						</label>
					{/each}
				</div>
			</div>
		</div>

		<div class="role-actions">
			<button class="admin-btn" onclick={save}>
				<Icon name="check" variant="light" />
				Salvar alterações
			</button>
			<a class="admin-btn ghost" href="/admin/roles">Cancelar</a>
		</div>
	{:else}
		<div class="empty">
			Role não encontrado. <a href="/admin/roles">Voltar aos Roles</a>
		</div>
	{/if}
</div>

<style>
	.role-edit-page {
		padding: 4px 0 8px;
	}
	.role-head {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 14px;
	}
	.role-head h2 {
		margin: 0;
		font-size: 20px;
	}
	.role-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 14px;
	}
	.color-pick {
		display: flex;
		gap: 6px;
	}
	.color-pick .swatch {
		border: 2px solid rgba(255, 255, 255, 0.5);
	}
	.swatch.active {
		border-color: #fff;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18);
	}
	.empty {
		font-size: 14px;
		color: var(--muted);
	}
</style>

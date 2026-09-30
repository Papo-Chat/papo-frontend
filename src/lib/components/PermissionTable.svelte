<script lang="ts">
	// Per-role channel permissions table (light glass rows). Rows come from the
	// caller (`roles`); the checkboxes reflect `perms` and fire `onToggle` on
	// change (the caller owns the store update — this component is stateless).
	import type { ChannelPermission, Role } from '$lib/types';

	let {
		perms,
		roles = [],
		onToggle
	} = $props<{
		perms: Record<string, ChannelPermission>;
		roles?: Role[];
		onToggle?: (roleId: string, key: keyof ChannelPermission, value: boolean) => void;
	}>();

	const PERMS = [
		{ key: 'read_channel' as const, label: 'Ler' },
		{ key: 'send_messages' as const, label: 'Enviar' },
		{ key: 'delete_messages' as const, label: 'Apagar' },
		{ key: 'connect_voice' as const, label: 'Voz' }
	];

	// Roles sem entry no canal usam permissões neutras (todo falso) — o
	// backend trata canais "abertos" à parte; aqui só refletimos o que o
	// usuário explicitamente definiu por role.
	function rowPerms(id: string): ChannelPermission {
		return (
			perms[id] ?? {
				read_channel: false,
				send_messages: false,
				delete_messages: false,
				connect_voice: false
			}
		);
	}
</script>

<table class="admin-table">
	<thead>
		<tr>
			<th>Role</th>
			{#each PERMS as p (p.key)}
				<th>{p.label}</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#each roles as r (r.id)}
			<tr>
				<td>
					<span class="chip" style="color: {r.color ?? '#666'}">{r.name}</span>
				</td>
				{#each PERMS as p (p.key)}
					<td>
						<input
							type="checkbox"
							checked={rowPerms(r.id)[p.key]}
							aria-label="{p.label} — {r.name}"
							onchange={(e) => onToggle?.(r.id, p.key, (e.target as HTMLInputElement).checked)}
						/>
					</td>
				{/each}
			</tr>
		{:else}
			<tr>
				<td colspan={5}>Sem roles.</td>
			</tr>
		{/each}
	</tbody>
</table>

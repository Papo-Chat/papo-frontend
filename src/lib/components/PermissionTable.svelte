<script lang="ts">
	// Per-role channel permissions table (light glass rows).
	import { sampleRoles } from '$lib/sample';
	import type { ChannelPermission } from '$lib/types';

	let { perms } = $props<{ perms: Record<string, ChannelPermission> }>();

	const PERMS = [
		{ key: 'read_channel' as const, label: 'Ler' },
		{ key: 'send_messages' as const, label: 'Enviar' },
		{ key: 'delete_messages' as const, label: 'Apagar' },
		{ key: 'connect_voice' as const, label: 'Voz' }
	];
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
		{#each sampleRoles as r (r.id)}
			<tr>
				<td>
					<span class="chip" style="color: {r.color}">{r.name}</span>
				</td>
				{#each PERMS as p (p.key)}
					<td>
						<input
							type="checkbox"
							bind:checked={perms[r.id][p.key]}
							aria-label="{p.label} — {r.name}"
						/>
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>

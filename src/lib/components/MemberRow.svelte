<script lang="ts">
	import type { RoleSummary, UserSummary } from '$lib/types';
	import { openProfile } from '$lib/store/ui.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import Avatar from './Avatar.svelte';

	let { user } = $props<{ user: UserSummary }>();

	// Star badge for the "Destaque" (highlighted) role, as in the mockup.
	const roleBadge = $derived(
		user.roles.find((r: RoleSummary) => r.name === 'Destaque') ? 'star' : null
	);

	// Cor da role do usuário (anel do avatar + nome).
	const roleColor = $derived(user.roles.find((r: RoleSummary) => r.color)?.color ?? null);

	// Extra glyph after the status message (e.g. music notes).
	function computeStatusIcon(): string | null {
		const m = (user.status_message || '').toLowerCase();
		if (m.includes('música')) return 'music-notes';
		return null;
	}
	const statusIcon = $derived(computeStatusIcon());

	// Live presence (WS) wins over the persisted summary status.
	const status = $derived(usersStore.effectiveStatus(user.id));

	function defaultStatus(status: 'online' | 'away' | 'busy' | 'offline'): string {
		switch (status) {
			case 'away':
				return 'Ausente';
			case 'busy':
				return 'Ocupado';
			case 'offline':
				return 'Offline';
			default:
				return 'Online';
		}
	}
</script>

<button
	class="member {status === 'online' ? 'online' : ''}"
	aria-label={`Ver perfil de ${user.nickname || user.username}`}
	onclick={() => openProfile(user)}
>
	<div class="member-avatar">
		<Avatar {user} size={30} />
		<span class="member-status-dot {status}" aria-label="Status: {defaultStatus(status)}"></span>
	</div>

	<div class="member-info">
		<div class="member-name">
			<span class="member-name-text" style={roleColor ? `color:${roleColor}` : undefined}>
				{user.nickname || user.username}
			</span>
			{#if roleBadge}
				<i class="ph-duotone ph-star member-badge-icon" aria-label="Destaque"></i>
			{/if}
		</div>
		<div class="status">
			{user.status_message || defaultStatus(status)}
			{#if statusIcon}
				<i class="ph-light ph-{statusIcon} status-icon" aria-hidden="true"></i>
			{/if}
		</div>
	</div>
</button>

<style>
	.member-avatar {
		position: relative;
		display: inline-flex;
	}
	.member-status-dot {
		position: absolute;
		right: -3px;
		bottom: -3px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 3px solid rgba(255, 255, 255, 0.9);
	}
	.member-status-dot.online {
		background: #24c982;
	}
	.member-status-dot.away {
		background: #e7a80b;
	}
	.member-status-dot.busy {
		background: #f03d5e;
	}
	.member-status-dot.offline {
		background: var(--muted);
	}
</style>

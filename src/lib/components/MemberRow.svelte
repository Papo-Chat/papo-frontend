<script lang="ts">
	import type { RoleSummary, UserSummary } from '$lib/types';
	import { openProfile } from '$lib/store/ui.svelte';
	import Icon from './Icon.svelte';
	import Avatar from './Avatar.svelte';

	let { user } = $props<{ user: UserSummary }>();

	// Star badge for the "Destaque" (highlighted) role, as in the mockup.
	const roleBadge = $derived(
		user.roles.find((r: RoleSummary) => r.name === 'Destaque') ? 'star' : null
	);

	// Extra glyph after the status message (e.g. music notes).
	function computeStatusIcon(): string | null {
		const m = (user.status_message || '').toLowerCase();
		if (m.includes('música')) return 'music-notes';
		return null;
	}
	const statusIcon = $derived(computeStatusIcon());

	function defaultStatus(status: UserSummary['status']): string {
		switch (status) {
			case 'away':
				return 'Ausente';
			case 'busy':
				return 'Jogando';
			default:
				return 'Online';
		}
	}
</script>

<button
	class="member {user.status === null ? 'online' : ''}"
	aria-label={`Ver perfil de ${user.nickname || user.username}`}
	onclick={() => openProfile(user)}
>
	{#if user.status === 'busy'}
		<div class="avatar">
			<Icon name="game-controller" variant="duotone" />
		</div>
	{:else}
		<Avatar username={user.username} nickname={user.nickname} size={30} />
	{/if}

	<div class="member-info">
		<div class="member-name">
			{user.nickname || user.username}
			{#if roleBadge}
				<i class="ph-duotone ph-star member-badge-icon" aria-label="Destaque"></i>
			{/if}
		</div>
		<div class="status">
			{user.status_message || defaultStatus(user.status)}
			{#if statusIcon}
				<i class="ph-light ph-{statusIcon} status-icon" aria-hidden="true"></i>
			{/if}
		</div>
	</div>
</button>

<style>
	.member .avatar i {
		font-size: 16px;
		line-height: 1;
	}
</style>

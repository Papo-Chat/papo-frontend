<script lang="ts">
	import * as usersStore from '$lib/store/users.svelte';

	let current: { id: number; name: string } | null = $state(null);
	let hideTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const notice = usersStore.state.joinNotice;
		if (!notice) return;

		const user = usersStore.state.byId.get(notice.userId);
		if (!user) return;

		const consumed = usersStore.consumeJoinNotice(notice.id);
		if (!consumed) return;

		current = {
			id: consumed.id,
			name: user.nickname || user.username
		};

		if (hideTimer) clearTimeout(hideTimer);
		hideTimer = setTimeout(() => {
			current = null;
			hideTimer = null;
		}, 4500);
	});
</script>

{#if current}
	{#key current.id}
		<div class="global-join-notice" role="status" aria-live="polite">
			{current.name} entrou no servidor
		</div>
	{/key}
{/if}

<style>
	.global-join-notice {
		position: fixed;
		left: 50%;
		bottom: 52px;
		z-index: 2250;
		transform: translateX(-50%);
		padding: 7px 12px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 650;
		box-shadow: 0 4px 14px rgb(0 0 0 / 0.16);
		white-space: nowrap;
		pointer-events: none;
		animation: join-life 4.5s ease forwards;
	}

	@keyframes join-life {
		0% { opacity: 0; }
		10%, 80% { opacity: 1; }
		100% { opacity: 0; }
	}
</style>

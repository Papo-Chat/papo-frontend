<script lang="ts">
	import type { DirectConversation } from '$lib/types';
	import * as usersStore from '$lib/store/users.svelte';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	let {
		dm,
		active = false,
		onOpen,
		onClose
	} = $props<{
		dm: DirectConversation;
		active?: boolean;
		onOpen: () => void;
		onClose: () => void;
	}>();

	const user = $derived(usersStore.state.byId.get(dm.user.id) ?? dm.user);
	const name = $derived(user.nickname || user.username);
	const status = $derived(usersStore.effectiveStatus(user.id));
	const unread = $derived(Math.max(0, dm.unread_count));
</script>

<div class="dm-rail-item" class:active>
	<button class="dm-open" type="button" onclick={onOpen} aria-label={`Abrir conversa com ${name}`} title={name}>
		<Avatar {user} size={46} />
		<span class="dm-status {status}" aria-hidden="true"></span>
		{#if unread > 0}
			<span class="dm-unread" aria-label={`${unread} mensagens não lidas`}>{unread > 99 ? '99+' : unread}</span>
		{/if}
	</button>
	<button
		class="dm-close"
		type="button"
		onclick={(event) => {
			event.stopPropagation();
			onClose();
		}}
		aria-label={`Fechar conversa com ${name}`}
		title="Fechar da barra"
	>
		<Icon name="x" variant="light" size={11} />
	</button>
</div>

<style>
	.dm-rail-item {
		position: relative;
		overflow: visible;
		width: 54px;
		height: 54px;
		flex: 0 0 54px;
		display: grid;
		place-items: center;
	}
	.dm-open {
		position: relative;
		overflow: visible;
		isolation: isolate;
		width: 50px;
		height: 50px;
		padding: 2px;
		display: grid;
		place-items: center;
		border: 1px solid transparent;
		border-radius: 17px;
		background: transparent;
		cursor: pointer;
		transition: transform 0.18s var(--ease), background 0.18s ease, border-color 0.18s ease;
	}
	.dm-open:hover,
	.dm-rail-item.active .dm-open {
		transform: translateY(-1px);
		background: rgba(255, 255, 255, 0.13);
		border-color: rgba(255, 255, 255, 0.2);
	}
	.dm-rail-item.active .dm-open::before {
		content: '';
		position: absolute;
		left: -9px;
		top: 12px;
		width: 3px;
		height: 26px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.95);
	}
	.dm-close {
		position: absolute;
		top: -1px;
		right: -1px;
		z-index: 4;
		width: 19px;
		height: 19px;
		padding: 0;
		display: grid;
		place-items: center;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.55);
		background: rgba(24, 58, 80, 0.9);
		color: #fff;
		box-shadow: 0 3px 8px rgba(0, 25, 45, 0.28);
		cursor: pointer;
		opacity: 0;
		transform: scale(0.78);
		transition: opacity 0.14s ease, transform 0.14s ease;
	}
	.dm-rail-item:hover .dm-close,
	.dm-close:focus-visible {
		opacity: 1;
		transform: scale(1);
	}
	.dm-unread {
		position: absolute;
		right: -2px;
		bottom: -2px;
		z-index: 6;
		min-width: 18px;
		height: 18px;
		box-sizing: border-box;
		padding: 0 4px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		border: 2px solid rgba(27, 91, 135, 0.94);
		background: #f04461;
		color: #fff;
		font-size: 9px;
		font-weight: 800;
		line-height: 1;
	}
	.dm-status {
		position: absolute;
		left: 1px;
		bottom: 1px;
		width: 11px;
		height: 11px;
		border-radius: 50%;
		border: 2px solid rgba(31, 94, 137, 0.96);
		background: #7f95a5;
	}
	.dm-status.online { background: #24c982; }
	.dm-status.away { background: #e7a80b; }
	.dm-status.busy { background: #f03d5e; }

	:global([data-theme='dark']) .dm-close {
		background: rgba(8, 28, 42, 0.96);
		border-color: rgba(181, 222, 248, 0.25);
	}
	:global(html[data-ui-flat]) .dm-open {
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
	}
	:global(html[data-ui-mobile]) .dm-open:hover {
		transform: none;
	}
	@media (max-width: 700px) {
		.dm-close {
			opacity: 1;
			transform: scale(0.92);
		}
	}
</style>

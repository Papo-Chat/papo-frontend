<script lang="ts">
	import type { DirectConversation, SearchResult } from '$lib/types';
	import { state as uiState, openProfile } from '$lib/store/ui.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import * as notificationsStore from '$lib/store/notifications.svelte';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import NotificationsPopover from './NotificationsPopover.svelte';
	import PinsPopover from './PinsPopover.svelte';
	import SearchMessagePopover from './SearchMessagePopover.svelte';

	let {
		dm,
		searchQuery = $bindable(''),
		searchOpen = $bindable(false),
		onSearchOpenChange,
		onSearchResult
	} = $props<{
		dm: DirectConversation;
		searchQuery?: string;
		searchOpen?: boolean;
		onSearchOpenChange?: (open: boolean) => void;
		onSearchResult?: (result: SearchResult) => void;
	}>();

	const name = $derived(dm.user.nickname || dm.user.username);
	const status = $derived(usersStore.effectiveStatus(dm.user.id));
	const statusLabel = $derived(
		status === 'online' ? 'Online' : status === 'away' ? 'Ausente' : status === 'busy' ? 'Ocupado' : 'Offline'
	);

	function openRail(): void {
		uiState.channelsDrawerOpen = false;
		uiState.membersDrawerOpen = false;
		uiState.voiceChatDrawerOpen = false;
		uiState.railDrawerOpen = true;
	}

	function openMembers(): void {
		uiState.railDrawerOpen = false;
		uiState.channelsDrawerOpen = false;
		uiState.voiceChatDrawerOpen = false;
		uiState.membersDrawerOpen = true;
	}

	function toggleSearch(): void {
		onSearchOpenChange?.(!searchOpen);
	}
</script>

<header class="topbar dm-topbar">
	<button class="chat-icon dm-nav-btn" onclick={openRail} aria-label="Abrir navegação" title="Abrir navegação">
		<Icon name="chat-circle-dots" variant="light" />
	</button>

	<div class="dm-title">
		<Avatar user={dm.user} size={38} onClick={() => openProfile(dm.user)} ariaLabel={`Ver perfil de ${name}`} />
		<button class="dm-title-copy" type="button" onclick={() => openProfile(dm.user)}>
			<strong>{name}</strong>
			<span><i class="dm-presence {status}" aria-hidden="true"></i>{statusLabel}</span>
		</button>
	</div>

	<div class="actions dm-actions">
		<button
			class="pill circle header-icon-btn dm-members-btn"
			onclick={openMembers}
			aria-label="Abrir membros"
			title="Abrir membros"
		>
			<Icon name="users-three" variant="light" />
		</button>

		<button
			class="pill circle header-icon-btn"
			onclick={toggleSearch}
			aria-label="Pesquisar nesta conversa"
			title="Pesquisar nesta conversa"
		>
			<Icon name="magnifying-glass" variant="light" />
		</button>

		<button
			class="pill circle header-icon-btn"
			style="position: relative"
			onclick={() => (uiState.notificationsPopoverOpen = true)}
			aria-label="Notificações"
			title="Notificações"
		>
			<Icon name="bell" variant="light" />
			{#if notificationsStore.state.unreadCount > 0}
				<span class="unread-badge">{notificationsStore.state.unreadCount}</span>
			{/if}
		</button>

		<button
			class="pill circle header-icon-btn"
			onclick={() => (uiState.pinsPopoverOpen = true)}
			aria-label="Mensagens fixadas"
			title="Mensagens fixadas"
		>
			<Icon name="push-pin" variant="light" />
		</button>
	</div>

	<NotificationsPopover />
	<PinsPopover channelId={dm.id} routePrefix="dm" />
	<SearchMessagePopover
		{searchQuery}
		open={searchOpen}
		onOpenChange={onSearchOpenChange}
		onResultClick={onSearchResult}
		scopeChannelId={dm.id}
		scopeLabel={`Mensagens com ${name}`}
	/>
</header>

<style>
	.dm-title {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.dm-title-copy {
		min-width: 0;
		display: grid;
		gap: 2px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.dm-title-copy strong {
		max-width: min(42vw, 420px);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 16px;
		font-weight: 780;
	}

	.dm-title-copy span {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--muted-soft);
		font-size: 10px;
		font-weight: 650;
	}

	.dm-presence {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #7f95a5;
	}
	.dm-presence.online { background: #24c982; }
	.dm-presence.away { background: #e7a80b; }
	.dm-presence.busy { background: #f03d5e; }

	.dm-nav-btn {
		display: none;
	}

	button.dm-title-copy,
	button.dm-nav-btn,
	button.pill {
		-webkit-appearance: none;
		appearance: none;
	}

	@media (min-width: 701px) {
		.dm-members-btn {
			display: none;
		}
	}

	@media (max-width: 700px) {
		.dm-nav-btn {
			display: grid;
		}

		.dm-title {
			gap: 8px;
		}

		.dm-title :global(.avatar) {
			width: 34px !important;
			height: 34px !important;
		}

		.dm-title-copy strong {
			max-width: 30vw;
			font-size: 14px;
		}

		.dm-title-copy span {
			font-size: 9px;
		}

		.dm-actions {
			gap: 5px;
		}

		.dm-actions .header-icon-btn {
			width: 36px;
			height: 36px;
		}
	}

	@media (max-width: 430px) {
		.dm-actions .dm-members-btn {
			display: none;
		}

		.dm-actions .header-icon-btn {
			width: 34px;
			height: 34px;
		}
	}
</style>

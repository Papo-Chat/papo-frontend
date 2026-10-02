<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Channel, SearchResult } from '$lib/types';
	import { state as uiState } from '$lib/store/ui.svelte';
	import * as notificationsStore from '$lib/store/notifications.svelte';
	import { meId, state as sessionState } from '$lib/store/session.svelte';
	import { state as serverState } from '$lib/store/server.svelte';
	import * as rolesStore from '$lib/store/roles.svelte';
	import { can } from '$lib/store/roles.svelte';
	import Icon from './Icon.svelte';
	import NotificationsPopover from './NotificationsPopover.svelte';
	import PinsPopover from './PinsPopover.svelte';
	import SearchMessagePopover from './SearchMessagePopover.svelte';

	let {
		channel,
		searchQuery = $bindable(''),
		searchOpen = $bindable(false),
		onSearchQueryChange,
		onSearchOpenChange,
		onSearchResult
	} = $props<{
		channel: Channel;
		searchQuery?: string;
		searchOpen?: boolean;
		onSearchQueryChange?: (q: string) => void;
		onSearchOpenChange?: (open: boolean) => void;
		onSearchResult?: (result: SearchResult) => void;
	}>();

	// Botão de administração: só visível para dono do servidor ou roles
	// com `manage_channels` — espelha o backend (RequireManageChannels
	// sobre PUT/DELETE /channels/:channel_id).
	const me = $derived(meId());
	const isOwner = $derived(!!me && serverState.server?.owner_id === me);
	const myRoleIds = $derived(new Set(sessionState.roles.map((r) => r.id)));
	const myRoles = $derived(rolesStore.state.list.filter((r) => myRoleIds.has(r.id)));
	const ctx = $derived({ roles: myRoles, isOwner });
	const canManageChannel = $derived(can('manage_channels', ctx));

	function openSidebar(): void {
		uiState.voiceChatDrawerOpen = false;
		uiState.channelsDrawerOpen = true;
	}

	function openMembers(): void {
		uiState.voiceChatDrawerOpen = false;
		uiState.membersDrawerOpen = true;
	}

	function toggleVoiceChat(): void {
		const next = !uiState.voiceChatDrawerOpen;
		if (next) {
			uiState.channelsDrawerOpen = false;
			uiState.membersDrawerOpen = false;
		}
		uiState.voiceChatDrawerOpen = next;
	}

	function openNotifications(): void {
		uiState.notificationsPopoverOpen = true;
	}

	function openPins(): void {
		uiState.pinsPopoverOpen = true;
	}

	function toggleSearch(): void {
		onSearchOpenChange?.(!searchOpen);
	}

	let topicOpen = $state(false);

	function openTopic(): void {
		topicOpen = true;
	}

	function closeTopic(): void {
		topicOpen = false;
	}

	function handleTopicKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			closeTopic();
		}
	}
</script>

<svelte:window onkeydown={handleTopicKeydown} />

<header class="topbar">
	<button class="chat-icon" onclick={openSidebar} aria-label="Abrir canais" title="Abrir canais">
		<Icon name="list" variant="light" />
	</button>

	<div class="title-wrap">
		<div class="title-row">
			<h2>{channel.name}</h2>
			{#if canManageChannel}
				<button
					class="pill channel-admin-btn"
					onclick={() => goto(`/channels/${channel.id}/admin`)}
					aria-label="Administração do canal"
					title="Administração do canal"
				>
					<Icon name="gear" variant="light" />
				</button>
			{/if}
		</div>
		{#if channel.topic}
			<button
				class="topic-preview"
				onclick={openTopic}
				aria-label="Ver tópico completo"
				title="Clique para ver o tópico completo"
			>
				{channel.topic}
			</button>
		{/if}
	</div>

	<div class="actions">
		{#if channel.type === 'voice'}
			<button
				class="pill circle header-icon-btn voice-chat-btn"
				class:active={uiState.voiceChatDrawerOpen}
				onclick={toggleVoiceChat}
				aria-label={uiState.voiceChatDrawerOpen ? 'Fechar chat de texto' : 'Abrir chat de texto'}
				title={uiState.voiceChatDrawerOpen ? 'Fechar chat de texto' : 'Abrir chat de texto'}
				aria-pressed={uiState.voiceChatDrawerOpen}
			>
				<Icon name="chat-circle-text" variant="light" />
				<span class="voice-chat-label">Chat</span>
			</button>
		{/if}
		<button
			class="pill circle header-icon-btn members-btn"
			onclick={openMembers}
			aria-label="Abrir membros"
			title="Abrir membros"
		>
			<Icon name="users-three" variant="light" />
		</button>
		{#if onSearchOpenChange}
			<button
				class="pill circle header-icon-btn"
				onclick={toggleSearch}
				aria-label="Pesquisar mensagens"
				title="Pesquisar mensagens"
			>
				<Icon name="magnifying-glass" variant="light" />
			</button>
		{/if}
		<button
			class="pill circle header-icon-btn"
			style="position: relative"
			onclick={openNotifications}
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
			onclick={openPins}
			aria-label="Mensagens fixadas"
			title="Mensagens fixadas"
		>
			<Icon name="push-pin" variant="light" />
		</button>
	</div>

	<NotificationsPopover />
	<PinsPopover />
	{#if onSearchOpenChange}
		<SearchMessagePopover
			{searchQuery}
			open={searchOpen}
			onOpenChange={onSearchOpenChange}
			onResultClick={onSearchResult}
		/>
	{/if}
</header>

{#if topicOpen}
	<div
		class="topic-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) closeTopic();
		}}
	>
		<section
			class="topic-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="topic-dialog-title"
		>
			<div class="topic-dialog-head">
				<div>
					<span class="topic-dialog-eyebrow">Tópico do canal</span>
					<h3 id="topic-dialog-title">{channel.name}</h3>
				</div>
				<button
					class="topic-close"
					onclick={closeTopic}
					aria-label="Fechar tópico"
					title="Fechar"
				>
					<Icon name="x" variant="light" size={18} />
				</button>
			</div>
			<p class="topic-full">{channel.topic}</p>
		</section>
	</div>
{/if}

<style>
	.title-wrap {
		/* width: 0 + flex-basis: 0 is intentional: it prevents a long topic
		 * from contributing its intrinsic width and pushing into the members
		 * column. The flex item receives only the actually available space. */
		flex: 1 1 0;
		width: 0;
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
	}

	.topic-preview {
		display: block;
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		max-width: 100%;
		margin: 2px 0 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 13px;
		line-height: 1.35;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: pointer;
	}

	.topic-preview:hover {
		color: var(--text);
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
		text-underline-offset: 3px;
	}

	.topic-preview:focus-visible {
		outline: 2px solid color-mix(in srgb, var(--accent) 65%, transparent);
		outline-offset: 3px;
		border-radius: 4px;
	}

	.topic-backdrop {
		position: fixed;
		inset: 0;
		z-index: 4000;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(8, 22, 38, 0.48);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
	}

	.topic-dialog {
		box-sizing: border-box;
		width: min(560px, 100%);
		max-height: min(70dvh, 560px);
		overflow: auto;
		padding: 18px;
		border: 1px solid #c5dbe8;
		border-radius: 20px;
		/* Deliberately opaque: topic text must remain readable over arbitrary
		 * user backgrounds. */
		background: #f2f9fd;
		box-shadow:
			inset 0 1px 0 #ffffff,
			0 24px 60px rgba(8, 28, 46, 0.32);
		color: var(--text);
	}

	.topic-dialog-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 14px;
	}

	.topic-dialog-eyebrow {
		display: block;
		margin-bottom: 3px;
		color: var(--muted);
		font-size: 11px;
		font-weight: 750;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.topic-dialog h3 {
		margin: 0;
		font-size: 20px;
	}

	.topic-close {
		flex: none;
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid #bfd5e2;
		border-radius: 50%;
		background: #e2f0f7;
		color: var(--text);
		cursor: pointer;
	}

	.topic-full {
		margin: 0;
		color: var(--text);
		font-size: 14px;
		line-height: 1.6;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	button.chat-icon {
		font: inherit;
		-webkit-appearance: none;
		appearance: none;
	}

	button.pill {
		font: inherit;
		-webkit-appearance: none;
		appearance: none;
	}

	.pill.circle.voice-chat-btn {
		width: auto;
		padding: 0 12px;
		display: inline-flex;
		gap: 6px;
		border-radius: 14px;
	}

	.voice-chat-btn.active {
		border-color: color-mix(in srgb, var(--accent) 48%, transparent);
		background: color-mix(in srgb, var(--accent) 16%, var(--surface));
		color: var(--accent);
	}

	.voice-chat-label {
		font-size: 12px;
		font-weight: 750;
	}

	.actions {
		flex: 0 0 auto;
		min-width: 0;
	}

	:global([data-theme='dark']) .topic-dialog {
		border-color: #315264;
		background: #142f40;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.08),
			0 24px 60px rgba(0, 0, 0, 0.48);
	}

	:global([data-theme='dark']) .topic-close {
		border-color: #3a5e72;
		background: #203f51;
	}

	:global(html[data-ui-flat]) .topic-backdrop,
	:global(html[data-ui-mobile]) .topic-backdrop {
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		background: rgba(8, 22, 38, 0.58);
	}

	:global(html[data-ui-flat]) .topic-dialog,
	:global(html[data-ui-mobile]) .topic-dialog {
		box-shadow: 0 10px 28px rgba(8, 28, 46, 0.24);
	}

	:global(html[data-ui-flat][data-theme='dark']) .topic-dialog,
	:global(html[data-ui-mobile][data-theme='dark']) .topic-dialog {
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.36);
	}

	@media (min-width: 701px) {
		.members-btn {
			display: none;
		}
	}

	@media (max-width: 700px) {
		.title-wrap {
			width: auto;
			min-width: 0;
			max-width: 100%;
		}

		.title-row {
			min-width: 0;
		}

		.title-row h2 {
			flex: 1 1 auto;
			min-width: 0;
		}

		.topic-preview {
			font-size: 12px;
		}

		.topic-backdrop {
			place-items: end center;
			padding: 0;
			background: rgba(8, 22, 38, 0.62);
		}

		.topic-dialog {
			width: 100%;
			max-height: 78dvh;
			padding: 18px 16px max(18px, env(safe-area-inset-bottom));
			border-right: 0;
			border-bottom: 0;
			border-left: 0;
			border-radius: 20px 20px 0 0;
		}

		.topic-full {
			font-size: 16px;
			line-height: 1.55;
		}

		.pill.circle.voice-chat-btn {
			width: 38px;
			height: 38px;
			padding: 0;
			gap: 0;
			display: grid;
			place-items: center;
			border-radius: 50%;
		}

		.voice-chat-btn :global(.icon) {
			margin: 0;
		}

		.voice-chat-label {
			display: none;
		}
	}
</style>

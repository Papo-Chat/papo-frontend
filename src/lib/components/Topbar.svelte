<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Channel, SearchResult } from '$lib/types';
	import { state } from '$lib/store/ui.svelte';
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
		state.voiceChatDrawerOpen = false;
		state.channelsDrawerOpen = true;
	}

	function openMembers(): void {
		state.voiceChatDrawerOpen = false;
		state.membersDrawerOpen = true;
	}

	function toggleVoiceChat(): void {
		const next = !state.voiceChatDrawerOpen;
		if (next) {
			state.channelsDrawerOpen = false;
			state.membersDrawerOpen = false;
		}
		state.voiceChatDrawerOpen = next;
	}

	function openNotifications(): void {
		state.notificationsPopoverOpen = true;
	}

	function openPins(): void {
		state.pinsPopoverOpen = true;
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
				class:active={state.voiceChatDrawerOpen}
				onclick={toggleVoiceChat}
				aria-label={state.voiceChatDrawerOpen ? 'Fechar chat de texto' : 'Abrir chat de texto'}
				title={state.voiceChatDrawerOpen ? 'Fechar chat de texto' : 'Abrir chat de texto'}
				aria-pressed={state.voiceChatDrawerOpen}
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
	<svelte:window onkeydown={handleTopicKeydown} />
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
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
	}

	.topic-preview {
		display: block;
		width: 100%;
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
		background: rgba(8, 22, 38, 0.26);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}

	.topic-dialog {
		width: min(560px, 100%);
		max-height: min(70vh, 560px);
		overflow: auto;
		padding: 18px;
		border: 1px solid rgba(255, 255, 255, 0.62);
		border-radius: 20px;
		background: color-mix(in srgb, var(--surface) 92%, transparent);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.7),
			0 24px 60px rgba(8, 28, 46, 0.28);
		backdrop-filter: blur(24px) saturate(140%);
		-webkit-backdrop-filter: blur(24px) saturate(140%);
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
		border: 1px solid rgba(255, 255, 255, 0.48);
		border-radius: 50%;
		background: color-mix(in srgb, var(--surface) 72%, transparent);
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

	@media (min-width: 701px) {
		.members-btn {
			display: none;
		}
	}

	@media (max-width: 700px) {
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

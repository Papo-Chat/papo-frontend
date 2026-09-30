<script lang="ts">
	import type { MessageWithAttachment, RoleSummary } from '$lib/types';
	import { openProfile, setScrollTarget } from '$lib/store/ui.svelte';
	import { meId, state as sessionState } from '$lib/store/session.svelte';
	import * as usersStore from '$lib/store/users.svelte';
	import * as channelsStore from '$lib/store/channels.svelte';
	import * as messagesStore from '$lib/store/messages.svelte';
	import * as rolesStore from '$lib/store/roles.svelte';
	import { state as serverState } from '$lib/store/server.svelte';
	import { channelAccess, can } from '$lib/store/roles.svelte';
	import { formatTime } from '$lib/utils/time';
	import Avatar from './Avatar.svelte';
	import Reactions from './Reactions.svelte';
	import PreviewCard from './PreviewCard.svelte';
	import Attachment from './Attachment.svelte';
	import FormattedMessage from './FormattedMessage.svelte';
	import Icon from './Icon.svelte';
	import { tick } from 'svelte';

	let { message, onReply } = $props<{
		message: MessageWithAttachment;
		onReply?: (message: MessageWithAttachment) => void;
	}>();

	// ── autor + permissões (fonte: stores, sem sample) ───────────────

	const me = $derived(meId());
	const author = $derived(usersStore.state.byId.get(message.author_id ?? ''));
	const channel = $derived(channelsStore.state.byId.get(message.channel_id));
	const isOwner = $derived(!!me && serverState.server?.owner_id === me);
  	const isMobile = () =>
    	window.matchMedia('(pointer: coarse)').matches;
	// Permissões: SOMENTE as roles do usuário logado. Os ids vêm do whoami
	// (sessionState.roles); os detalhes de permissão vêm do list do store de
	// roles. Usar todas as roles do servidor daria permissão que o usuário não tem.
	const myRoleIds = $derived(new Set(sessionState.roles.map((r) => r.id)));
	const myRoles = $derived(rolesStore.state.list.filter((r) => myRoleIds.has(r.id)));
	const roleColor = $derived(author?.roles.find((r: RoleSummary) => r.color)?.color ?? null);

	const ctx = $derived({ roles: myRoles, isOwner });
	const access = $derived(channel ? channelAccess(channel, ctx) : null);

	const isAuthor = $derived(message.author_id === me);
	const canEdit = $derived(isAuthor);
	const canDelete = $derived(isAuthor || (access?.del ?? false));
	const canPin = $derived(can('pin_message', ctx));
	const canReply = $derived(access?.send ?? false);

	// ── fixado (pinned list do canal) ────────────────────────────────

	const pinnedIds = $derived(
		new Set((messagesStore.getChannel(message.channel_id)?.pinned ?? []).map((p) => p.id))
	);
	const isPinned = $derived(pinnedIds.has(message.id));

	const name = $derived(author?.nickname || author?.username || 'Usuário');
	const msgReply = $derived(messagesStore.getMessage(message.channel_id, message.reply_to));
	const replyAuthor = $derived(usersStore.state.byId.get(msgReply?.author_id ?? ''));

	// ── ações: edit/delete/reply/pin ─────────────────────────────────

	let showActions = $state(false);
	let messageEl: HTMLElement | null = null;
	let isEditing = $state(false);
	let editText = $state('');
	let showDeleteConfirm = $state(false);
	let deleteButton: HTMLButtonElement | null = null;

	async function startDelete(): Promise<void> {
		showDeleteConfirm = true;
		await tick();
		deleteButton?.focus();
	}

	// Ao toque (mobile), mantém as ações visíveis até o usuário tocar
	// fora da mensagem.
	$effect(() => {
		if (!showActions || !messageEl) return;
		function onDocDown(e: PointerEvent): void {
			const el = messageEl;
			if (!el || (!el.contains(e.target as Node) && e.pointerType === 'touch')) {
				showActions = false;
			}
		}
		document.addEventListener('pointerdown', onDocDown);
		return () => document.removeEventListener('pointerdown', onDocDown);
	});

	function onEnter(): void {
		showActions = true;
	}

	function onLeave(e: PointerEvent): void {
		if (e.pointerType === 'mouse') showActions = false;
	}

	function startEdit(): void {
		isEditing = true;
		editText = message.content ?? '';
		showActions = false;
	}

	function doEdit(): void {
		const t = editText.trim();
		if (t) {
			messagesStore.edit(message.id, t);
		}
		isEditing = false;
		showActions = false;
	}

	function handleEditKeydown(event:KeyboardEvent) {
		if (event.key === 'Escape') cancelEdit();
		if (
		event.key === 'Enter' &&
			!event.shiftKey &&
			!event.isComposing &&
			!isMobile()
		) {
		event.preventDefault();
		doEdit();
		}
	}
	function cancelEdit(): void {
		isEditing = false;
		showActions = false;
	}

	function doDelete(): void {
		messagesStore.remove(message.id);
		showDeleteConfirm = false;
		showActions = false;
	}

	function cancelDelete(): void {
		showDeleteConfirm = false;
		showActions = false;
	}

	function doReply(): void {
		onReply?.(message);
		showActions = false;
	}

	// O indicador de resposta ("responder a X") é clicável: leva à mensagem
	// original, se ela estiver no histórico carregado do canal.
	function jumpToReply(): void {
		if (message.reply_to) {
			setScrollTarget(message.reply_to, msgReply?.created_at ?? null);
		}
	}

	function togglePin(): void {
		if (isPinned) {
			messagesStore.unpin(message.channel_id, message.id);
		} else {
			messagesStore.pin(message.channel_id, message.id);
		}
		showActions = false;
	}
</script>

<article
	class="message"
	data-message-id={message.id}
	bind:this={messageEl}
	onpointerenter={onEnter}
	onpointerleave={onLeave}
>
		<Avatar
			user={author}
			size={39}
			ariaLabel={author ? `Ver perfil de ${name}` : undefined}
			onClick={() => {
				if (author) openProfile(author);
			}}
		/>
		<div class="content">
			<div class="meta">
		<button
			class="name"
			style={roleColor ? `color:${roleColor}` : undefined}
			aria-label={author ? `Ver perfil de ${name}` : undefined}
			onclick={() => {
			if (author) openProfile(author);
		}}
	>
		{name}
		</button>

			<span class="time">
				{formatTime(message.created_at)}
				{#if message.edited_at}
					<span class="edited">· editado</span>
				{/if}
			</span>

			{#if message.reply_to}
				{#if replyAuthor}
					<button
						class="reply-from"
						type="button"
						aria-label="Ir para a mensagem original"
						onclick={jumpToReply}
					>
						<Avatar user={replyAuthor} size={18} />
						{replyAuthor.nickname || replyAuthor.username}

						{#if msgReply}
							{#if msgReply.content}
								{msgReply.content.length > 32
									? msgReply.content.slice(0, 32) + '...'
									: msgReply.content}
							{:else}
								{#if msgReply.attachments.length}
									<span class="reply-from">
										<i>Anexo</i>
									</span>
								{/if}
							{/if}
						{/if}
					</button>
				{:else}
					<button
						class="reply-from"
						type="button"
						aria-label="Ir para a mensagem original"
						onclick={jumpToReply}
					>
						<i>Conteúdo Indisponível</i>
					</button>
				{/if}
			{/if}

			{#if showActions || isPinned}
				<div class="message-actions" role="toolbar">
					{#if isPinned}
						<button
							class="act-btn pinned-action"
							type="button"
							title="Desfixar mensagem"
							aria-label="Desfixar mensagem"
							disabled={!canPin}
							onclick={togglePin}
						>
							<Icon name="pin" variant="duotone" />
						</button>
					{/if}

					{#if showActions}
						{#if canReply}
							<button class="act-btn" type="button" title="Responder" onclick={doReply}>
								<Icon name="arrow-bend-up-left" variant="light" />
							</button>
						{/if}

						{#if canPin && !isPinned}
							<button
								class="act-btn"
								type="button"
								title="Fixar mensagem"
								onclick={togglePin}
							>
								<Icon name="push-pin" variant="light" />
							</button>
						{/if}

						{#if canEdit}
							<button class="act-btn" type="button" title="Editar" onclick={startEdit}>
								<Icon name="pencil" variant="light" />
							</button>
						{/if}

						{#if canDelete}
							<button
								class="act-btn"
								type="button"
								title="Excluir"
								onclick={startDelete}
							>
								<Icon name="trash" variant="light" />
							</button>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
			{#if isEditing}
				<div class="bubble">
					<form
						class="edit-form"
						onsubmit={(e) => {
							e.preventDefault();
							doEdit();
						}}
					>
					<textarea
						class="edit-input"
						bind:value={editText}
						aria-label="Editar mensagem"
						placeholder="..."
						autofocus
						onkeydown={handleEditKeydown}
					/>
					</form>
					<button class="confirm-btn" type="button" onclick={doEdit}> Enviar </button>
				</div>
			{:else if message.content}
				<div class="bubble {isPinned ? 'pinned' : ''}">
					<FormattedMessage content={message.content} />
				</div>
				{#if message.previews.length}
					{#each message.previews as p (p.id)}
						<PreviewCard preview={p} />
					{/each}
				{/if}
			{:else if message.previews.length}
				{#each message.previews as p (p.id)}
					<PreviewCard preview={p} />
				{/each}
			{/if}

			<!-- anexos: thumbnail de imagem, player de vídeo/áudio ou chip. -->
			{#if message.attachments.length}
				{#each message.attachments as a (a.id)}
					<Attachment attachment={a} />
				{/each}
			{/if}

			{#if showDeleteConfirm}
				<div class="delete-confirm" role="alert">
					<span>Excluir mensagem?</span>
					<button
						bind:this={deleteButton}
						class="confirm-btn danger"
						type="button"
						onclick={doDelete}
					>
						Excluir
					</button>
					<button class="confirm-btn" type="button" onclick={cancelDelete}> Cancelar </button>
				</div>
			{:else}
				{#if message.reactions.length || canReply}
					<Reactions
						messageId={message.id}
						channelId={message.channel_id}
						reactions={message.reactions}
						userReactions={message.user_reactions}
					/>
				{/if}
			{/if}
		</div>
</article>

<style>
	.message {
		display: flex;
		gap: 8px;
		padding: 4px 8px;
		border-radius: 10px;
		position: relative;
	}
	.edit-input {
		font: inherit;
		color: var(--text-primary);
		background: transparent;

		border: 1px solid var(--muted);
		border-radius: 8px;
		padding: 6px 10px;

		width: fit-content;
		max-width: 100%;
		min-width: 40px;

		field-sizing: content;
		box-sizing: border-box;

		resize: none;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
		outline: none;
	}
	/* importante: seu .message só possui .message-enter como filho */
	.message-enter {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		width: 100%;
		min-width: 0;
		animation: message-enter 180ms ease;
	}

	.content {
		flex: 1;
		min-width: 0;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;

		/* impede toolbar de criar uma segunda linha */
		flex-wrap: nowrap;
	}

	.name {
		font: inherit;
		font-weight: 600;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-primary);
		padding: 0;

		flex-shrink: 0;
	}
	@keyframes message-enter {
		to {
			opacity: 1;
			transform: translateY(-2px);
		}
	}

	.time {
		color: var(--muted);
		font-size: 12px;
		margin-left: 0;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.edited {
		color: var(--muted-soft);
	}

	.message-actions {
		display: flex;
		align-items: center;
		gap: 4px;

		margin-left: auto;
		height: 28px;
		flex-shrink: 0;

		/* deixa a toolbar como último item da linha */
		order: 99;
	}

	.act-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;

		width: 20px;
		height: 20px;
		padding: 0;
	}

	.reply-from {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		font: inherit;
		color: var(--muted);

		margin: 0;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		text-align: left;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		-webkit-appearance: none;
		appearance: none;
	}
	.reply-from:hover {
		color: var(--text);
	}
	.act-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-secondary);
		cursor: pointer;
	}
	.act-btn:hover {
		background: var(--hover);
		color: var(--text-primary);
	}
	.pinned-action {
		color: #a87500;
		background: rgba(231, 168, 11, 0.12);
		border-color: rgba(231, 168, 11, 0.22);
	}
	.pinned-action:disabled {
		cursor: default;
		opacity: 0.72;
	}
	.pinned-action:hover:not(:disabled) {
		background: rgba(231, 168, 11, 0.2);
		color: #8a6100;
	}
	:global([data-theme='dark']) .pinned-action {
		color: #ffd66d;
		border-color: rgba(255, 214, 109, 0.18);
	}
	.delete-confirm {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 6px;
		padding: 6px 8px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		font-size: 13px;
	}
	/* mesmo idioma visual do .send (aero.css): segue o tema (light/dark)
	 * e fica parecido com o botão de enviar. */
	.confirm-btn {
		font: inherit;
		font-weight: 800;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.42);
		background: linear-gradient(180deg, #54aaf2, #0a73d6);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.48),
			0 8px 18px rgba(10, 96, 165, 0.2);
		color: #fff;
		cursor: pointer;
		padding: 4px 12px;
		transition: 0.18s var(--ease);
	}
	.confirm-btn:hover {
		transform: translateY(-2px);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.58),
			0 12px 23px rgba(10, 96, 165, 0.28),
			0 0 18px rgba(84, 170, 242, 0.2);
	}
	.confirm-btn:active {
		transform: scale(0.97);
	}
	.confirm-btn.danger {
		background: linear-gradient(180deg, #ff8a7d, #d6423e);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.48),
			0 8px 18px rgba(214, 66, 62, 0.25);
		color: #fff;
	}
	.confirm-btn.danger:hover {
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.58),
			0 12px 23px rgba(214, 66, 62, 0.3),
			0 0 18px rgba(255, 138, 125, 0.2);
	}
</style>

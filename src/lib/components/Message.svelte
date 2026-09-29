<script lang="ts">
	import type { MessageWithAttachment, RoleSummary } from '$lib/types';
	import { openProfile } from '$lib/store/ui.svelte';
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
	import Icon from './Icon.svelte';

	let {
		message,
		onReply
	} = $props<{
		message: MessageWithAttachment;
		onReply?: (message: MessageWithAttachment) => void;
	}>();

	// ── autor + permissões (fonte: stores, sem sample) ───────────────

	const me = $derived(meId());
	const author = $derived(usersStore.state.byId.get(message.author_id ?? ''));
	const channel = $derived(channelsStore.state.byId.get(message.channel_id));
	const isOwner = $derived(!!me && serverState.server?.owner_id === me);

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
	const msgReply = $derived(messagesStore.getMessage(message.channel_id,message.reply_to))
	const replyAuthor = $derived(usersStore.state.byId.get(msgReply?.author_id ?? ''));

	// ── ações: edit/delete/reply/pin ─────────────────────────────────

	let showActions = $state(false);
	let messageEl: HTMLElement | null = null;
	let isEditing = $state(false);
	let editText = $state('');
	let showDeleteConfirm = $state(false);

	// Ao toque (mobile), mantém as ações visíveis até o usuário tocar
	// fora da mensagem.
	$effect(() => {
		if (!showActions || !messageEl) return;
		function onDocDown(e: PointerEvent): void {
			const el = messageEl;
			if (!el || !el.contains(e.target as Node) && e.pointerType === 'touch') {
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
	<div class="message-enter">
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
				<!-- reply indicator -->
				{#if message.reply_to && replyAuthor}
					<span class="reply-from" aria-label="Resposta para {replyAuthor.nickname || replyAuthor.username}">
						<Avatar user={replyAuthor} size={18} />
						{replyAuthor.nickname || replyAuthor.username}
						{#if msgReply && msgReply.content}
							{msgReply?.content.length > 10 ? msgReply?.content.slice(0, 32) + '...' : msgReply?.content}
						{/if}
					</span>
				{/if}
				{#if showActions}
					<div class="message-actions" role="toolbar">
						{#if canReply}
							<button class="act-btn" type="button" title="Responder" aria-label="Responder" onclick={doReply}>
								<Icon name="arrow-bend-up-left" variant="light" />
							</button>
						{/if}
						{#if canPin}
							<button
								class="act-btn"
								type="button"
								title={isPinned ? 'Desfixar mensagem' : 'Fixar mensagem'}
								aria-label={isPinned ? 'Desfixar mensagem' : 'Fixar mensagem'}
								onclick={togglePin}
							>
								<Icon name={isPinned ? 'pin' : 'push-pin'} variant="light" />
							</button>
						{/if}
						{#if canEdit}
							<button class="act-btn" type="button" title="Editar" aria-label="Editar" onclick={startEdit}>
								<Icon name="pencil" variant="light" />
							</button>
						{/if}
						{#if canDelete}
							<button class="act-btn" type="button" title="Excluir" aria-label="Excluir" onclick={() => (showDeleteConfirm = true)}>
								<Icon name="trash" variant="light" />
							</button>
						{/if}
					</div>
				{/if}
			</div>


			{#if isEditing}
				<form class="edit-form" onsubmit={(e) => { e.preventDefault(); doEdit(); }}>
					<input
						class="edit-input"
						bind:value={editText}
						aria-label="Editar mensagem"
						placeholder="..."
						onkeydown={(e) => {
							if (e.key === 'Escape') cancelEdit();
						}}
					/>
				</form>
			{:else if message.content}
				<div class="bubble">
					<p>{message.content}</p>
				</div>
			{:else if message.previews.length}
				{#each message.previews as p (p.id)}
					<PreviewCard preview={p} />
				{/each}
			{/if}

			<!-- anexos (uploads ainda em fase de integração; renderize simples) -->
			{#if message.attachments.length}
				{#each message.attachments as a (a.id)}
					<span class="attachment-chip">{a.original_file_name}</span>
				{/each}
			{/if}

			{#if showDeleteConfirm}
				<div class="delete-confirm" role="alert">
					<span>Excluir mensagem?</span>
					<button class="confirm-btn danger" type="button" onclick={doDelete}>
						Excluir
					</button>
					<button class="confirm-btn" type="button" onclick={cancelDelete}>
						Cancelar
					</button>
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
	.message-enter {
		animation: message-enter 180ms ease;
	}
	@keyframes message-enter {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.name {
		font: inherit;
		font-weight: 600;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-primary);
		padding: 0;
	}
	.time {
		color: var(--muted);
		font-size: 12px;
		margin-left: 6px;
	}
	.edited {
		color: var(--muted-soft);
	}
	.bubble p {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.reply-from {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--muted);
		margin-bottom: 4px;
	}
	.edit-input {
		width: 100%;
		font: inherit;
		background: transparent;
		border: none;
		color: var(--text-primary);
		outline: none;
		margin: 0;
	}
	.edit-form {
		display: flex;
	}
	.attachment-chip {
		display: inline-block;
		font-size: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 2px 8px;
		margin-left: 6px;
		color: var(--text-secondary);
	}
	.message-actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		align-self: center;
		gap: 4px;
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
	.confirm-btn {
		font: inherit;
		border-radius: 6px;
		padding: 2px 8px;
		cursor: pointer;
	}
	.confirm-btn.danger {
		color: var(--danger);
	}
</style>

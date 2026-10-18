// Identidade de exibição de uma mensagem: usuário do Papo ou webhook.
// Mensagens de webhook têm author_id null; nome e avatar vêm de
// external_author (com o nome persistente do webhook quando source é
// 'webhook'). Sem essa regra, qualquer superfície fora do chat (pins, busca,
// notificações, prévia de resposta) cai no fallback "Usuário" sem avatar.

import * as webhooksStore from '../store/webhooks.svelte';
import type { ExternalAuthor, Message, UserSummary } from '../types/models';

export interface MessageAuthorIdentity {
	isWebhook: boolean;
	userId: string | null;
	webhookId: string | null;
	// UserSummary quando a mensagem é de um usuário (null se o usuário foi
	// removido ou ainda não foi carregado).
	user: UserSummary | null;
	// Autoria de exibição quando a mensagem é de webhook.
	external: ExternalAuthor | null;
	name: string;
	// Caminho/URL crua do avatar do webhook (resolvida por WebhookAvatar).
	avatarUrl: string | null;
}

// Shape mínimo das listagens: Message, SearchResult e NotificationSummary têm
// esses três campos, cada uma com um shape diferente no resto.
type MessageAuthorFields = Pick<Message, 'author_id' | 'webhook_id' | 'external_author'>;

export function messageAuthorIdentity(
	message: MessageAuthorFields | null | undefined,
	author?: UserSummary | null,
	// Nome vindo da própria listagem (ex.: author_username da busca) para não
	// mostrar "Usuário" enquanto o resumo do autor ainda não foi carregado.
	fallbackName?: string | null
): MessageAuthorIdentity {
	const webhookId = message?.webhook_id ?? null;
	const external = webhookId ? (message?.external_author ?? null) : null;

	if (webhookId) {
		// source 'webhook' é a identidade persistente do webhook: o nome pode
		// ter sido alterado depois do envio, então vale o nome atual (com o
		// snapshot da mensagem de fallback). Autoria temporária de um bot
		// externo é por mensagem e nunca é renomeada.
		const name =
			external?.source === 'webhook'
				? webhooksStore.displayName(webhookId, external.name || 'Webhook')
				: external?.name || 'Webhook';
		return {
			isWebhook: true,
			userId: null,
			webhookId,
			user: null,
			external,
			name,
			avatarUrl: external?.avatar_url ?? null
		};
	}

	const userId = message?.author_id ?? null;
	return {
		isWebhook: false,
		userId,
		webhookId: null,
		user: author ?? null,
		external: null,
		name: author?.nickname || author?.username || fallbackName || 'Usuário',
		avatarUrl: null
	};
}

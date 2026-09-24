// ── Sample data (mockup) ─────────────────────────────────────────────
//
// Static sample data used to render the UI while the frontend is not yet
// wired to the API. Shapes match the real request/response types from
// `src/lib/types/models.ts`, so components can be bound to the real stores
// later without shape changes.
//
// No real binary assets are shipped here (base64 blobs / media shas);
// components fall back to deterministic initial-letter avatars and CSS
// gradients when those fields are empty.
//
// `sampleMe` is the authenticated user in this mockup (Luna).

import type {
	Channel,
	NotificationSummary,
	Server,
	UserSummary,
	MessageWithAttachment,
	Role,
	Emoji,
	AuditLogEntry
} from '$lib/types';
//
// ── users ─────────────────────────────────────────────────────────────
// UserSummary (members list). `status` is `null` (online), 'away' or 'busy'.
// The "JOGANDO" section is derived in the Sidebar from `status === 'busy'`.

export const sampleUsers: UserSummary[] = [
	{
		id: 'user-luna',
		username: 'luna',
		nickname: 'Luna',
		status: null,
		status_message: 'Criando belos layouts',
		typing: null,
		status_updated_at: '2026-09-22T09:21:00Z',
		created_at: '2025-03-14T00:00:00Z',
		roles: [
			{ id: 'role-destaque', name: 'Destaque', color: '#e7a80b' },
			{ id: 'role-designer', name: 'Designer', color: '#9b5de5' }
		]
	},
	{
		id: 'user-kael',
		username: 'kael',
		nickname: 'Kael',
		status: null,
		status_message: 'Trabalhando no projeto',
		typing: null,
		status_updated_at: '2026-09-22T09:22:00Z',
		created_at: '2025-02-02T00:00:00Z',
		roles: [
			{ id: 'role-mod', name: 'Moderador', color: '#30d158' },
			{ id: 'role-comm', name: 'Comunidade', color: '#0a84ff' }
		]
	},
	{
		id: 'user-orion',
		username: 'orion',
		nickname: 'Orion',
		status: null,
		status_message: 'Explorando o cosmos',
		typing: null,
		status_updated_at: '2026-09-22T09:23:00Z',
		created_at: '2025-04-21T00:00:00Z',
		roles: [{ id: 'role-fundador', name: 'Fundador', color: '#5ac8fa' }]
	},
	{
		id: 'user-maya',
		username: 'maya',
		nickname: 'Maya',
		status: null,
		status_message: 'Disponível',
		typing: null,
		status_updated_at: '2026-09-22T09:25:00Z',
		created_at: '2025-05-09T00:00:00Z',
		roles: [{ id: 'role-comm', name: 'Comunidade', color: '#0a84ff' }]
	},
	{
		id: 'user-juno',
		username: 'juno',
		nickname: 'Juno',
		status: null,
		status_message: 'Ouvindo música',
		typing: null,
		status_updated_at: '2026-09-22T09:24:00Z',
		created_at: '2025-06-17T00:00:00Z',
		roles: [{ id: 'role-gamer', name: 'Gamer', color: '#ff5d63' }]
	},
	{
		id: 'user-theo',
		username: 'theo',
		nickname: 'Theo',
		status: null,
		status_message: 'Bora conversar!',
		typing: null,
		status_updated_at: '2026-09-22T09:20:00Z',
		created_at: '2025-07-01T00:00:00Z',
		roles: [{ id: 'role-comm', name: 'Comunidade', color: '#0a84ff' }]
	},
	{
		id: 'user-alex',
		username: 'alex',
		nickname: 'Alex',
		status: null,
		status_message: 'Online',
		typing: null,
		status_updated_at: '2026-09-22T09:10:00Z',
		created_at: '2025-08-10T00:00:00Z',
		roles: [{ id: 'role-comm', name: 'Comunidade', color: '#0a84ff' }]
	},
	{
		id: 'user-sam',
		username: 'sam',
		nickname: 'Sam',
		status: null,
		status_message: 'Disponível',
		typing: null,
		status_updated_at: '2026-09-22T09:15:00Z',
		created_at: '2025-09-05T00:00:00Z',
		roles: [{ id: 'role-comm', name: 'Comunidade', color: '#0a84ff' }]
	},
	{
		id: 'user-zee',
		username: 'zee',
		nickname: 'Zee',
		status: 'away',
		status_message: 'Ausente',
		typing: null,
		status_updated_at: '2026-09-22T08:00:00Z',
		created_at: '2025-09-20T00:00:00Z',
		roles: [{ id: 'role-comm', name: 'Comunidade', color: '#0a84ff' }]
	},
	{
		id: 'user-iris',
		username: 'iris',
		nickname: 'Iris',
		status: 'away',
		status_message: 'Volto já',
		typing: null,
		status_updated_at: '2026-09-22T08:10:00Z',
		created_at: '2025-10-01T00:00:00Z',
		roles: [{ id: 'role-comm', name: 'Comunidade', color: '#0a84ff' }]
	},
	{
		id: 'user-pietro',
		username: 'pietro',
		nickname: 'Pietro',
		status: 'away',
		status_message: 'No almoço',
		typing: null,
		status_updated_at: '2026-09-22T08:30:00Z',
		created_at: '2025-10-15T00:00:00Z',
		roles: [{ id: 'role-comm', name: 'Comunidade', color: '#0a84ff' }]
	},
	{
		id: 'user-nick',
		username: 'nick',
		nickname: 'Nick',
		status: 'busy',
		status_message: 'Jogando Sky Quest',
		typing: null,
		status_updated_at: '2026-09-22T09:00:00Z',
		created_at: '2025-11-01T00:00:00Z',
		roles: [{ id: 'role-gamer', name: 'Gamer', color: '#ff5d63' }]
	},
	{
		id: 'user-leo',
		username: 'leo',
		nickname: 'Leo',
		status: 'busy',
		status_message: 'Jogando Pixel Quest',
		typing: null,
		status_updated_at: '2026-09-22T09:05:00Z',
		created_at: '2025-11-20T00:00:00Z',
		roles: [{ id: 'role-comm', name: 'Comunidade', color: '#0a84ff' }]
	}
];

// The authenticated user in this mockup (used for "me" reactions + avatar).
export const sampleMe: UserSummary = sampleUsers[0];

// ── server ────────────────────────────────────────────────────────────

export const sampleServer: Server = {
	id: 'server-aeroclub',
	name: 'AeroClub',
	icon_blob: null,
	icon_format: '',
	owner_id: 'user-orion',
	owner_username: 'orion',
	public: true,
	created_at: '2025-01-15T00:00:00Z',
	role_count: 3,
	member_count: sampleUsers.length,
	channel_count: 13
};

// ── channels ──────────────────────────────────────────────────────────
// Categories (type 'category') act as sidebar section headers, matching the
// mockup SALAS / CONVERSAS / VOZ / PRIVADO groups. `last_read_at` is set so
// the unread count equals the mockup badges (3/1/2/1/1).

export const sampleChannels: Channel[] = [
	{
		id: 'cat-salas',
		name: 'SALAS',
		type: 'category',
		position: 0,
		permissions: [],
		created_at: '2025-01-15T00:00:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'off'
	},
	{
		id: 'chan-geral',
		name: 'geral',
		type: 'text',
		position: 1,
		permissions: [],
		created_at: '2025-01-15T00:01:00Z',
		topic: 'Bate-papo sobre tudo e todos do AeroClub',
		last_message: {
			id: 'm-5',
			content: 'Ficou muito profissional e ao mesmo tempo acolhedor. Parabéns!',
			author_id: 'user-maya',
			author_username: 'maya',
			created_at: '2026-09-22T09:25:00Z'
		},
		last_read_message: null,
		last_read_at: '2026-09-22T09:22:30Z',
		notification_settings: 'all'
	},
	{
		id: 'chan-design',
		name: 'design',
		type: 'text',
		position: 2,
		permissions: [],
		created_at: '2025-01-15T00:02:00Z',
		topic: 'Conceitos, paletas e detalhes de interface',
		last_message: {
			id: 'm-d1',
			content: 'Novos conceitos de layout prontos.',
			author_id: 'user-kael',
			author_username: 'kael',
			created_at: '2026-09-22T10:00:00Z'
		},
		last_read_message: null,
		last_read_at: '2026-09-22T09:00:00Z',
		notification_settings: 'all'
	},
	{
		id: 'chan-anuncios',
		name: 'anúncios',
		type: 'text',
		position: 3,
		permissions: [],
		created_at: '2025-01-15T00:03:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'only_mentions'
	},
	{
		id: 'chan-feedback',
		name: 'feedback',
		type: 'text',
		position: 4,
		permissions: [],
		created_at: '2025-01-15T00:04:00Z',
		topic: null,
		last_message: {
			id: 'm-f2',
			content: 'Boa, mas o espaçamento tá apertado.',
			author_id: 'user-orion',
			author_username: 'orion',
			created_at: '2026-09-22T09:50:00Z'
		},
		last_read_message: null,
		last_read_at: '2026-09-22T09:40:00Z',
		notification_settings: 'all'
	},
	{
		id: 'cat-conversas',
		name: 'CONVERSAS',
		type: 'category',
		position: 5,
		permissions: [],
		created_at: '2025-01-15T00:00:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'off'
	},
	{
		id: 'chan-ideias',
		name: 'ideias',
		type: 'text',
		position: 6,
		permissions: [],
		created_at: '2025-01-15T00:05:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'only_mentions'
	},
	{
		id: 'chan-projetos',
		name: 'projetos',
		type: 'text',
		position: 7,
		permissions: [],
		created_at: '2025-01-15T00:06:00Z',
		topic: null,
		last_message: {
			id: 'm-p1',
			content: 'Atualizei o board do projeto.',
			author_id: 'user-luna',
			author_username: 'luna',
			created_at: '2026-09-22T10:10:00Z'
		},
		last_read_message: null,
		last_read_at: '2026-09-22T09:00:00Z',
		notification_settings: 'all'
	},
	{
		id: 'chan-eventos',
		name: 'eventos',
		type: 'text',
		position: 8,
		permissions: [],
		created_at: '2025-01-15T00:07:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'only_mentions'
	},
	{
		id: 'cat-voz',
		name: 'VOZ',
		type: 'category',
		position: 9,
		permissions: [],
		created_at: '2025-01-15T00:00:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'off'
	},
	{
		id: 'chan-lounge',
		name: 'Lounge',
		type: 'voice',
		position: 10,
		permissions: [],
		created_at: '2025-01-15T00:08:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'off'
	},
	{
		id: 'chan-reuniao',
		name: 'Reunião',
		type: 'voice',
		position: 11,
		permissions: [],
		created_at: '2025-01-15T00:09:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'off'
	},
	{
		id: 'chan-musica',
		name: 'Música',
		type: 'voice',
		position: 12,
		permissions: [],
		created_at: '2025-01-15T00:10:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'off'
	},
	{
		id: 'cat-privado',
		name: 'PRIVADO',
		type: 'category',
		position: 13,
		permissions: [],
		created_at: '2025-01-15T00:00:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'off'
	},
	{
		id: 'chan-mensagens',
		name: 'Mensagens',
		type: 'text',
		position: 14,
		permissions: [],
		created_at: '2025-01-15T00:11:00Z',
		topic: null,
		last_message: {
			id: 'm-dm1',
			content: 'Bora conversar!',
			author_id: 'user-theo',
			author_username: 'theo',
			created_at: '2026-09-22T10:15:00Z'
		},
		last_read_message: null,
		last_read_at: '2026-09-22T09:00:00Z',
		notification_settings: 'all'
	},
	{
		id: 'chan-favoritos',
		name: 'Favoritos',
		type: 'text',
		position: 15,
		permissions: [],
		created_at: '2025-01-15T00:12:00Z',
		topic: null,
		last_message: null,
		last_read_message: null,
		last_read_at: null,
		notification_settings: 'off'
	}
];

// ── messages ──────────────────────────────────────────────────────────
// Full message list. `sampleMe` (Luna) is the authenticated user; her
// reactions show up in `user_reactions` (rendered without a count).

export const sampleMessages: MessageWithAttachment[] = [
	// ── geral ──
	{
		id: 'm-1',
		channel_id: 'chan-geral',
		author_id: 'user-luna',
		content: 'Pessoal, terminei a proposta do novo layout!',
		created_at: '2026-09-22T09:21:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [],
		reactions: [
			{ emoji_id: 'rx-heart', unicode: '❤️', count: 4 },
			{ emoji_id: 'rx-thumbs', unicode: '👍', count: 3 },
			{ emoji_id: 'rx-smile', unicode: '😊', count: 1 }
		],
		user_reactions: [{ id: 'ur-1', emoji_id: 'rx-smile', unicode: '😊' }]
	},
	{
		id: 'm-2',
		channel_id: 'chan-geral',
		author_id: 'user-kael',
		content:
			'Ficou incrível, Luna! A paleta tá linda demais.\nA navegação lateral ficou bem mais clara.',
		created_at: '2026-09-22T09:22:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [],
		reactions: [],
		user_reactions: []
	},
	{
		id: 'm-3',
		channel_id: 'chan-geral',
		author_id: 'user-orion',
		content:
			'Concordo! A hierarquia das seções ficou perfeita.\nAproveita e mostra como ficou o dashboard?',
		created_at: '2026-09-22T09:23:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [],
		reactions: [],
		user_reactions: []
	},
	{
		id: 'm-4',
		channel_id: 'chan-geral',
		author_id: 'user-luna',
		content: null,
		created_at: '2026-09-22T09:24:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [
			{
				id: 'pv-dashboard',
				url: 'https://aeroclub.example/dashboard',
				kind: 'dashboard',
				title: 'Preview do Dashboard',
				description: 'Resumo da Comunidade',
				provider_name: 'AeroClub',
				embed_url: null,
				image_mime_type: null,
				image_size_bytes: null,
				fetched_at: '2026-09-22T09:24:00Z'
			}
		],
		reactions: [
			{ emoji_id: 'rx-grin', unicode: '😀', count: 4 },
			{ emoji_id: 'rx-grin-2', unicode: '😄', count: 2 },
			{ emoji_id: 'rx-smile', unicode: '😊', count: 5 },
			{ emoji_id: 'rx-smile-2', unicode: '🙂', count: 3 },
			{ emoji_id: 'rx-cool', unicode: '😎', count: 2 },
			{ emoji_id: 'rx-laugh', unicode: '🤣', count: 4 },
			{ emoji_id: 'rx-laugh-2', unicode: '😂', count: 6 },
			{ emoji_id: 'rx-heart-eyes', unicode: '🥰', count: 3 },
			{ emoji_id: 'rx-heart-eyes-2', unicode: '😍', count: 5 },
			{ emoji_id: 'rx-kiss', unicode: '😘', count: 2 },
			{ emoji_id: 'rx-party', unicode: '🥳', count: 4 },
			{ emoji_id: 'rx-party-2', unicode: '🎉', count: 6 },
			{ emoji_id: 'rx-rocket', unicode: '🚀', count: 3 },
			{ emoji_id: 'rx-star', unicode: '⭐', count: 5 },
			{ emoji_id: 'rx-sparkle', unicode: '✨', count: 4 },
			{ emoji_id: 'rx-fire', unicode: '🔥', count: 7 }
		],
		user_reactions: []
	},
	{
		id: 'm-5',
		channel_id: 'chan-geral',
		author_id: 'user-maya',
		content: 'Ficou muito profissional e ao mesmo tempo acolhedor. Parabéns!',
		created_at: '2026-09-22T09:25:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [],
		reactions: [
			{ emoji_id: 'rx-thumbs', unicode: '👍', count: 2 },
			{ emoji_id: 'rx-smile', unicode: '😊', count: 1 }
		],
		user_reactions: [{ id: 'ur-5', emoji_id: 'rx-smile', unicode: '😊' }]
	},
	// ── design ──
	{
		id: 'm-d1',
		channel_id: 'chan-design',
		author_id: 'user-kael',
		content: 'Novos conceitos de layout prontos.',
		created_at: '2026-09-22T10:00:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [],
		reactions: [],
		user_reactions: []
	},
	// ── feedback ──
	{
		id: 'm-f1',
		channel_id: 'chan-feedback',
		author_id: 'user-maya',
		content: 'Feedback sobre o menu lateral.',
		created_at: '2026-09-22T09:45:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [],
		reactions: [],
		user_reactions: []
	},
	{
		id: 'm-f2',
		channel_id: 'chan-feedback',
		author_id: 'user-orion',
		content: 'Boa, mas o espaçamento tá apertado.',
		created_at: '2026-09-22T09:50:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [],
		reactions: [],
		user_reactions: []
	},
	// ── projetos ──
	{
		id: 'm-p1',
		channel_id: 'chan-projetos',
		author_id: 'user-luna',
		content: 'Atualizei o board do projeto.',
		created_at: '2026-09-22T10:10:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [],
		reactions: [],
		user_reactions: []
	},
	// ── mensagens (DM) ──
	{
		id: 'm-dm1',
		channel_id: 'chan-mensagens',
		author_id: 'user-theo',
		content: 'Bora conversar!',
		created_at: '2026-09-22T10:15:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [],
		reactions: [],
		user_reactions: []
	}
];

// ── notifications ─────────────────────────────────────────────────────

export const sampleNotifications: NotificationSummary[] = [
	{
		id: 'n-1',
		message_id: 'm-2',
		channel_id: 'chan-geral',
		author_id: 'user-kael',
		message_content: 'Ficou incrível, Luna! A paleta tá linda demais.',
		read: false,
		created_at: '2026-09-22T09:22:00Z'
	},
	{
		id: 'n-2',
		message_id: 'm-5',
		channel_id: 'chan-geral',
		author_id: 'user-maya',
		message_content: 'Ficou muito profissional e ao mesmo tempo acolhedor. Parabéns!',
		read: false,
		created_at: '2026-09-22T09:25:00Z'
	}
];

// ── pinned messages ───────────────────────────────────────────────────

export const samplePins: MessageWithAttachment[] = [
	{
		id: 'm-4',
		channel_id: 'chan-geral',
		author_id: 'user-luna',
		content: null,
		created_at: '2026-09-22T09:24:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [
			{
				id: 'pv-dashboard',
				url: 'https://aeroclub.example/dashboard',
				kind: 'dashboard',
				title: 'Preview do Dashboard',
				description: 'Resumo da Comunidade',
				provider_name: 'AeroClub',
				embed_url: null,
				image_mime_type: null,
				image_size_bytes: null,
				fetched_at: '2026-09-22T09:24:00Z'
			}
		],
		reactions: [
			{ emoji_id: 'rx-star', unicode: '⭐', count: 5 },
			{ emoji_id: 'rx-heart', unicode: '❤️', count: 3 },
			{ emoji_id: 'rx-rocket', unicode: '🚀', count: 2 },
			{ emoji_id: 'rx-smile', unicode: '😊', count: 1 }
		],
		user_reactions: []
	},
	{
		id: 'm-1',
		channel_id: 'chan-geral',
		author_id: 'user-luna',
		content: 'Pessoal, terminei a proposta do novo layout!',
		created_at: '2026-09-22T09:21:00Z',
		edited_at: null,
		reply_to: null,
		attachments: [],
		previews: [],
		reactions: [
			{ emoji_id: 'rx-heart', unicode: '❤️', count: 4 },
			{ emoji_id: 'rx-thumbs', unicode: '👍', count: 3 },
			{ emoji_id: 'rx-smile', unicode: '😊', count: 1 }
		],
		user_reactions: [{ id: 'ur-1', emoji_id: 'rx-smile', unicode: '😊' }]
	}
];

// ── helpers ───────────────────────────────────────────────────────────

export function messagesByChannel(): Record<string, MessageWithAttachment[]> {
	const map: Record<string, MessageWithAttachment[]> = {};
	for (const m of sampleMessages) {
		if (!map[m.channel_id]) map[m.channel_id] = [];
		map[m.channel_id].push(m);
	}
	return map;
}

export function unreadCount(channel: Channel): number {
	const msgs = (messagesByChannel() ?? {})[channel.id] ?? [];
	if (channel.last_read_at == null) {
		return msgs.length;
	}
	const cutoff = channel.last_read_at;
	return msgs.filter((m) => m.created_at > cutoff).length;
}

export function channelById(id: string): Channel | null {
	return sampleChannels.find((c) => c.id === id) ?? null;
}

// Resolve a channel from a raw route param: exact id first, then name,
// then the first channel (so /channels/geral and /channels/chan-geral
// both work).
export function resolveChannel(id: string | null | undefined): Channel {
	if (!id) return sampleChannels[0];
	return (
		sampleChannels.find((c) => c.id === id) ??
		sampleChannels.find((c) => c.name === id) ??
		sampleChannels[0]
	);
}

export function userById(id: string | null): UserSummary | null {
	if (!id) return null;
	return sampleUsers.find((u) => u.id === id) ?? null;
}

// ── admin sample data ─────────────────────────────────────────
// Roles (full permission set, matching the RolePermissions shape).
export const sampleRoles: Role[] = [
	{
		id: 'role-owner',
		name: 'Dono',
		color: '#e7a80b',
		permissions: {
			manage_server: true,
			manage_channels: true,
			manage_roles: true,
			ban_members: true,
			pin_message: true,
			everyone_message: true,
			send_attachment: true
		},
		created_at: '2025-01-01T00:00:00Z'
	},
	{
		id: 'role-admin',
		name: 'Administrador',
		color: '#30d158',
		permissions: {
			manage_server: false,
			manage_channels: true,
			manage_roles: false,
			ban_members: true,
			pin_message: true,
			everyone_message: true,
			send_attachment: true
		},
		created_at: '2025-01-15T00:00:00Z'
	},
	{
		id: 'role-mod',
		name: 'Moderador',
		color: '#0a84ff',
		permissions: {
			manage_server: false,
			manage_channels: false,
			manage_roles: false,
			ban_members: true,
			pin_message: true,
			everyone_message: false,
			send_attachment: true
		},
		created_at: '2025-02-01T00:00:00Z'
	},
	{
		id: 'role-comm',
		name: 'Comunidade',
		color: '#9b5de5',
		permissions: {
			manage_server: false,
			manage_channels: false,
			manage_roles: false,
			ban_members: false,
			pin_message: false,
			everyone_message: false,
			send_attachment: true
		},
		created_at: '2025-01-01T00:00:00Z'
	}
];

// Emojis (empty image_blob — no real binary assets shipped).
export const sampleEmojis: Emoji[] = [
	{ id: 'emoji-luna', name: 'luna', image_blob: '', format: 'png', created_by: 'user-luna', created_at: '2025-03-10T00:00:00Z' },
	{ id: 'emoji-kael', name: 'kael', image_blob: '', format: 'png', created_by: 'user-kael', created_at: '2025-03-11T00:00:00Z' },
	{ id: 'emoji-orion', name: 'orion', image_blob: '', format: 'png', created_by: 'user-orion', created_at: '2025-03-12T00:00:00Z' },
	{ id: 'emoji-nyx', name: 'nyx', image_blob: '', format: 'png', created_by: 'user-nyx', created_at: '2025-03-13T00:00:00Z' }
];

// Audit log entries.
export const sampleAuditLogs: AuditLogEntry[] = [
	{
		id: 'audit-1',
		actor_username: 'luna',
		action: 'channel_create',
		entity_type: 'channel',
		target_user_id: null,
		metadata: { name: 'geral' },
		created_at: '2026-09-20T09:00:00Z'
	},
	{
		id: 'audit-2',
		actor_username: 'luna',
		action: 'role_create',
		entity_type: 'role',
		target_user_id: null,
		metadata: { name: 'Moderador' },
		created_at: '2026-09-20T10:30:00Z'
	},
	{
		id: 'audit-3',
		actor_username: 'kael',
		action: 'user_ban',
		entity_type: 'user',
		target_user_id: 'user-nyx',
		metadata: { reason: 'toxicidade' },
		created_at: '2026-09-21T14:15:00Z'
	},
	{
		id: 'audit-4',
		actor_username: 'luna',
		action: 'emoji_create',
		entity_type: 'emoji',
		target_user_id: null,
		metadata: { name: 'luna' },
		created_at: '2026-09-21T16:45:00Z'
	}
];

export function roleById(id: string): Role | null {
	return sampleRoles.find((r) => r.id === id) ?? null;
}

export function emojiById(id: string): Emoji | null {
	return sampleEmojis.find((e) => e.id === id) ?? null;
}

// Deterministic reaction-user list (demo only — no API wiring yet).
// Returns up to `count` distinct users who reacted to `unicode` on the given
// message; seeded by message+emoji so the list is stable across reloads.
export function reactionUsers(messageId: string, unicode: string, count: number): UserSummary[] {
	let seed = 0;
	for (const c of messageId + unicode) seed = (seed * 31 + c.charCodeAt(0)) | 0;
	const seen = new Set<string>();
	const users: UserSummary[] = [];
	for (let i = 0; i < count && users.length < sampleUsers.length; i++) {
		const u = sampleUsers[(seed + i * 7) % sampleUsers.length];
		if (!seen.has(u.id)) {
			seen.add(u.id);
			users.push(u);
		}
	}
	return users;
}

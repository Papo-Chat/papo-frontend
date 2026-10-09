// ── roles ──────────────────────────────────────────────

export interface RolePermissions {
	manage_server: boolean;
	manage_channels: boolean;
	manage_roles: boolean;
	ban_members: boolean;
	pin_message: boolean;
	everyone_message: boolean;
	send_attachment: boolean;
}

export interface RoleSummary {
	id: string;
	name: string;
	color: string | null;
}

export interface Role {
	id: string;
	name: string;
	color: string | null;
	permissions: RolePermissions;
	created_at: string;
}

// ── channels ───────────────────────────────────────────

export interface ChannelPermission {
	read_channel: boolean;
	send_messages: boolean;
	delete_messages: boolean;
	connect_voice: boolean;
}

export interface ChannelPermissionEntry {
	role_id: string;
	role_name: string;
	permissions: ChannelPermission;
}

export interface ChannelLastMessage {
	id: string;
	content: string | null;
	author_id: string | null;
	author_username: string | null;
	created_at: string;
}

export type ChannelType = 'text' | 'category' | 'voice';

export type NotificationSettings = 'off' | 'only_mentions' | 'all';

export interface Channel {
	id: string;
	name: string;
	type: ChannelType;
	position: number;
	permissions: ChannelPermissionEntry[];
	created_at: string;
	// category channels have a null topic; voice channels may have a topic.
	topic: string | null;
	last_message: ChannelLastMessage | null;
	// user_channel_state; null until the user has read the channel.
	last_read_message: string | null;
	last_read_at: string | null;
	notification_settings: NotificationSettings;
}

// ── direct messages ────────────────────────────────────

export interface DirectConversation {
	id: string;
	user: UserSummary;
	created_at: string;
	last_message: ChannelLastMessage | null;
	last_read_message: string | null;
	last_read_at: string | null;
	unread_count: number;
}

export interface DirectConversationList {
	dms: DirectConversation[];
}

// ── users ──────────────────────────────────────────────

export type PersistedStatus = 'away' | 'busy';

export interface UserSummary {
	id: string;
	username: string;
	nickname: string | null;
	banned?: boolean;
	status: PersistedStatus | null;
	status_message: string | null;
	typing: string | null;
	status_updated_at: string | null;
	created_at: string;
	roles: RoleSummary[];
}

export interface UserProfile extends UserSummary {
	// base64 blob of the avatar (null when the user has no avatar).
	avatar_blob: string | null;
	avatar_format: string;
	// sha of the banner in the media table (null when absent);
	// the banner is fetched via GET /media/:sha.
	banner_media: string | null;
	description: string | null;
}

export interface UserList {
	users: UserSummary[];
	has_more: boolean;
}

// ── server (singleton) ─────────────────────────────────

export interface Server {
	id: string;
	name: string;
	// base64 blob of the icon (null when the server has no icon).
	icon_blob: string | null;
	icon_format: string;
	owner_id: string | null;
	owner_username: string | null;
	public: boolean;
	created_at: string;
	role_count: number;
	member_count: number;
	channel_count: number;
}

// ── messages ───────────────────────────────────────────

export interface MessageAttachment {
	id: string;
	mime_type: string;
	original_file_name: string;
	size_bytes: number;
	thumbnail_id: string | null;
	created_at: string;
	moderation_status: string;
}

// Summary of a reaction type on a message (count only).
export interface MessageReactionSummary {
	emoji_id: string | null;
	unicode: string | null;
	count: number;
}

// A user who reacted to a message (used as pagination cursor for the
// reaction-user list).
export interface MessageReactionUser {
	id: string;
	user_id: string;
	created_at: string;
}

export interface MessageReactionGroup {
	emoji_id: string | null;
	unicode: string | null;
	count: number;
	users: MessageReactionUser[];
}

// The authenticated user's own reaction to a message (exposed as
// user_reactions in message responses).
export interface MessageUserReaction {
	id: string;
	emoji_id: string | null;
	unicode: string | null;
}

export interface Message {
	id: string;
	channel_id: string;
	author_id: string | null;
	content: string | null;
	created_at: string;
	edited_at: string | null;
	reply_to: string | null;
}

export interface MessageWithAttachment extends Message {
	attachments: MessageAttachment[];
	embeds: Embed[];
	reactions: MessageReactionSummary[];
	user_reactions: MessageUserReaction[];
}

export interface MessageList {
	channel_id: string;
	messages: MessageWithAttachment[];
	has_more: boolean;
}

export interface PinnedMessageList {
	channel_id: string;
	// Always an array (possibly empty), never null.
	pinned: MessageWithAttachment[];
}

// ── embeds ─────────────────────────────────────────────

export type EmbedSourceType = 'link' | 'custom';
export type EmbedFetchMethod = 'opengraph' | 'oembed' | 'manual';

// Mídia do embed (thumbnail, imagem, vídeo, ícone do footer, avatar do autor).
// A referência interna (sha256) não é exposta: a imagem da thumbnail é lida por
// GET /embeds/:embed_id (image_data) e o vídeo pelo relay autenticado
// GET /embeds/:embed_id/video. Imagens não expõem URL.
export interface EmbedMedia {
	url?: string | null;
	mime_type?: string | null;
	width?: number | null;
	height?: number | null;
	size_bytes?: number | null;
}

export interface EmbedAuthor {
	name?: string | null;
	url?: string | null;
	media?: EmbedMedia | null;
}

export interface EmbedFooter {
	text?: string | null;
	icon?: EmbedMedia | null;
}

export interface EmbedField {
	// Ordem de exibição (0..N).
	position: number;
	name: string;
	value: string;
	inline: boolean;
}

// Embed de mensagem: automático (source_type 'link', OpenGraph/oEmbed) ou
// customizado (source_type 'custom'). O backend omite campos ausentes
// (omitempty), então tudo que não é sempre presente chega opcional ou null.
export interface Embed {
	id: string;
	source_type: EmbedSourceType;
	fetch_method: EmbedFetchMethod;
	provider?: string | null;
	site_name?: string | null;
	url?: string | null;
	title?: string | null;
	description?: string | null;
	// Cor de destaque (#RRGGBB).
	color?: string | null;
	author?: EmbedAuthor | null;
	thumbnail?: EmbedMedia | null;
	image?: EmbedMedia | null;
	video?: EmbedMedia | null;
	footer?: EmbedFooter | null;
	fields?: EmbedField[];
	// Iframe derivado de padrão hardcoded do backend (MVP: YouTube). O frontend
	// só renderiza iframe quando casar exatamente com esse padrão.
	embed_url?: string | null;
	created_at: string;
	fetched_at?: string | null;
}

// GET /embeds/:embed_id: campos públicos + imagem da thumbnail em base64.
export interface EmbedWithImage extends Embed {
	// base64 da thumbnail, null quando não há imagem.
	image_data: string | null;
}

// ── embeds customizados (entrada do cliente) ───────────

export interface EmbedMediaInput {
	url: string;
	// Obrigatório para vídeo (allowlist: video/mp4, video/webm, video/ogg).
	mime_type?: string;
}

export interface EmbedAuthorInput {
	name?: string;
	url?: string;
}

export interface EmbedFooterInput {
	text?: string;
}

export interface EmbedFieldInput {
	name: string;
	value: string;
	inline?: boolean;
}

// Embed customizado enviado na criação/edição de mensagem. O cliente não
// controla source_type/fetch_method/timestamps: o backend fixa
// source_type='custom' e fetch_method='manual'.
export interface EmbedInput {
	title?: string;
	description?: string;
	url?: string;
	color?: string;
	site_name?: string;
	author?: EmbedAuthorInput;
	footer?: EmbedFooterInput;
	thumbnail?: EmbedMediaInput;
	image?: EmbedMediaInput;
	video?: EmbedMediaInput;
	fields?: EmbedFieldInput[];
}

// ── emojis ─────────────────────────────────────────────

export interface Emoji {
	id: string;
	name: string;
	// base64 blob of the emoji image.
	image_blob: string;
	format: string;
	created_by: string | null;
	created_at: string;
}

export interface EmojiList {
	emojis: Emoji[];
	has_more: boolean;
}

// ── notifications ──────────────────────────────────────

export interface NotificationSummary {
	id: string;
	message_id: string;
	channel_id: string;
	author_id: string | null;
	// Truncated to 512 characters.
	message_content: string;
	read: boolean;
	created_at: string;
}

export interface NotificationList {
	notifications: NotificationSummary[];
	has_more: boolean;
}

// ── settings ───────────────────────────────────────────

export interface UserConfigNotifications {
	enabled: boolean;
	messagePreview: boolean;
	sound: boolean;
	mentions: boolean;
}

export interface UserConfigDisplay {
	fontSize: string;
	messageDensity: string;
	showTimestamps: boolean;
	showAvatars: boolean;
}

export interface UserConfig {
	theme: string;
	notifications: UserConfigNotifications;
	display: UserConfigDisplay;
}

export interface UserSettings {
	user_id: string;
	version: number;
	config: UserConfig;
	updated_at: string;
}

// ── search ───────────────────────────────────────────────

export interface SearchResult {
	type: string;
	id: string;
	content: string | null;
	channel_id: string;
	channel_name: string;
	author_id: string | null;
	author_username: string | null;
	created_at: string;
	score: number | null;
}

export interface SearchResponse {
	results: SearchResult[];
	has_more: boolean;
}

// ── misc ───────────────────────────────────────────────

export interface ConnectionInfo {
	id: string;
	created_at: string;
	expires_at: string;
}

export interface AuditLogEntry {
	id: string;
	actor_username: string;
	action: string;
	entity_type: string;
	target_user_id: string | null;
	metadata: Record<string, unknown>;
	created_at: string;
}

export interface AuditLogList {
	logs: AuditLogEntry[];
	has_more: boolean;
}

export interface ICEServer {
	urls: string[];
	username?: string;
	credential?: string;
}

export interface VoiceState {
	user_id: string;
	muted: boolean;
	camera_on: boolean;
	screen_sharing: boolean;
}

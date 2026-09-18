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

// ── users ──────────────────────────────────────────────

export type PersistedStatus = 'away' | 'busy';

export interface UserSummary {
	id: string;
	username: string;
	nickname: string | null;
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
	previews: LinkPreview[];
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

// ── link previews ──────────────────────────────────────

export interface LinkPreview {
	id: string;
	url: string;
	kind: string;
	title: string | null;
	description: string | null;
	provider_name: string | null;
	embed_url: string | null;
	image_mime_type: string | null;
	image_size_bytes: number | null;
	fetched_at: string;
}

// GET /link-previews/:preview_id: public fields + embedded base64 image.
export interface LinkPreviewWithImage extends LinkPreview {
	// base64 of the thumbnail, null when there is no image.
	image_data: string | null;
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

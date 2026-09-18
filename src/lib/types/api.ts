import type {
	AuditLogList,
	ChannelPermission,
	ChannelPermissionEntry,
	ConnectionInfo,
	LinkPreviewWithImage,
	MessageList,
	MessageReactionGroup,
	NotificationList,
	PinnedMessageList,
	RolePermissions,
	SearchResponse,
	Server,
	UserConfig,
	UserList,
	UserProfile,
} from './models';

// ── auth ───────────────────────────────────────────────

export interface RegisterRequest {
	username: string;
	password: string;
}

export interface RegisterResponse {
	id: string;
	username: string;
	created_at: string;
}

export interface LoginRequest {
	username: string;
	password: string;
}

// No token in the body; the session is delivered only via the HttpOnly
// `Auth` cookie (Set-Cookie).
export interface LoginResponse {
	user: {
		id: string;
		username: string;
	};
	// true when token reuse was detected (all sessions revoked).
	connection_violation: boolean;
}

export interface LoginServerRequest {
	server_password: string;
}

export interface WhoamiResponse {
	id: string;
	username: string;
	nickname: string | null;
	// base64 blob of the avatar (null when absent).
	avatar_blob: string | null;
	avatar_format: string;
	status: 'away' | 'busy' | null;
	status_message: string | null;
	typing: string | null;
	status_updated_at: string | null;
	created_at: string;
	roles: {
		id: string;
		name: string;
		color: string | null;
	}[];
	settings: {
		version: number;
		config: UserConfig;
	};
	connection_violation: boolean;
}

export interface ConnectedDevicesResponse {
	connections: ConnectionInfo[];
}

export interface DropConnectionRequest {
	// UUID of a specific connection, or "ALL" (case-insensitive) to revoke all.
	connection_id: string;
}

export interface DropConnectionResponse {
	dropped: number;
}

// ── users ──────────────────────────────────────────────

export interface UpdateUserRequest {
	// nickname, status and description are all required (nil → 400).
	nickname: string;
	status: 'away' | 'busy' | null;
	description: string;
	// Optional: absent (null) leaves the persisted value unchanged.
	typing: string | null;
}

export interface UpdateUserSuccessResponse {
	response: string;
}

export interface UpdateStatusRequest {
	// null removes the persisted status.
	status: 'away' | 'busy' | null;
}

export interface UpdateAvatarRequest {
	// base64 of a GIF/JPEG/PNG/WEBP up to 2MB.
	avatar: string;
	avatar_format: string;
}

export interface UpdateBannerRequest {
	// base64 of a GIF/JPEG/PNG/WEBP up to 2MB.
	banner: string;
	banner_format: string;
}

export interface BanUserRequest {
	user_id: string;
	ban_state: boolean | null;
}

export interface ChangePasswordRequest {
	password: string;
}

export interface ReadNotificationRequest {
	// 1 to 1000 ids.
	notification_ids: string[];
}

export interface ReadNotificationResponse {
	updated: number;
}

export interface UpdateChannelUserSettingRequest {
	notification_settings: 'off' | 'only_mentions' | 'all';
}

export interface ChannelUserSetting {
	user_id: string;
	channel_id: string;
	notification_settings: 'off' | 'only_mentions' | 'all';
	updated_at: string;
}

// ── server ─────────────────────────────────────────────

export interface CreateServerRequest {
	name: string;
	// base64 of a GIF/JPEG/PNG/WEBP up to 2MB.
	icon_blob: string;
	icon_format: string;
	// Required when public === false.
	password: string | null;
	public: boolean;
}

export interface UpdateServerRequest {
	name: string;
	icon_blob: string;
	icon_format: string;
	password: string | null;
	public: boolean | null;
}

// ── channels ───────────────────────────────────────────

export interface CreateChannelRequest {
	name: string;
	type: 'text' | 'category' | 'voice';
	// Optional; max 512 chars; only valid for text/voice channels.
	topic: string | null;
}

export interface UpdateChannelRequest {
	name: string;
	topic: string | null;
}

export interface ChangeChannelPositionRequest {
	old_position: number;
	new_position: number;
}

export interface ChannelPermissionsResponse {
	channel_id: string;
	permissions: ChannelPermissionEntry[];
}

export interface UpdateChannelPermissionsRequest {
	permissions: ChannelPermission;
}

export interface UpdateChannelPermissionsResponse {
	channel_id: string;
	role_id: string;
	permissions: ChannelPermission;
}

// ── messages ───────────────────────────────────────────

export interface MessageSendPayload {
	channel_id: string;
	// Optional if there are attachments; max 8192 chars.
	content: string | null;
	// Optional; must reference a message in the same channel.
	reply_to: string | null;
	// FormData files under the repeated `attachments` field.
	files?: File[];
}

export interface ReactionRequest {
	// Exactly one of emoji_id / unicode is required.
	emoji_id: string | null;
	unicode: string | null;
}

export interface MessageReactionList {
	message_id: string;
	reactions: MessageReactionGroup[];
	has_more: boolean;
}

// ── roles ──────────────────────────────────────────────

export interface CreateRoleRequest {
	name: string;
	color: string | null;
	permissions: RolePermissions;
}

export interface UpdateRoleRequest {
	name: string;
	color: string | null;
	permissions: RolePermissions;
}

export interface AssignUserRoleRequest {
	role_id: string;
}

// ── emojis ─────────────────────────────────────────────

export interface CreateEmojiRequest {
	name: string;
	format: string;
	// base64 of an image up to 256KB.
	image_blob: string;
}

// ── search ─────────────────────────────────────────────

export interface SearchRequest {
	// At least one filter must be provided.
	text: string;
	author: string;
	order: 'asc' | 'desc';
	// YYYY-MM-DD, date_start <= date_end.
	date_start: string;
	date_end: string;
	contains_attachment: boolean | null;
}

// ── admin ──────────────────────────────────────────────

export interface AuditLogFilters {
	action: string;
	actor_id: string;
	entity_type: string;
}

// ── re-exports used by the api namespace return types ──

export type {
	Server,
	UserList,
	UserProfile,
	MessageList,
	MessageReactionGroup,
	NotificationList,
	PinnedMessageList,
	ChannelPermissionEntry,
	ChannelPermission,
	LinkPreviewWithImage,
	SearchResponse,
	AuditLogList,
	UserConfig,
} from './models';

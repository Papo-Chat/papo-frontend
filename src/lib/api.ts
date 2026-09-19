// REST transport + full endpoint map (60 REST endpoints, §5).
//
// - credentials: 'include' (HttpOnly `Auth` cookie).
// - Base URL from PUBLIC_API_URL (empty → same-origin, for nginx prod).
// - Generates an X-Request-ID per request; includes it in errors.
// - Non-2xx → parse application/problem+json → throw ApiError.
// - 204 → undefined.
// - 401 hook → registered onUnauthorized callback (wired by the session store
//   → invalidate()). Refresh is proactive (F21), never on 401.
// - `authFailure: 'ignore'` skips the 401 hook (public auth endpoints).
// - FormData (multipart) keeps its own Content-Type; no JSON override.
// - AbortError is rethrown as-is (not wrapped in ApiError).

import { PUBLIC_API_URL } from './env';
import type {
	Channel,
	ChannelPermissionEntry,
	ChannelPermissionsResponse,
	ChannelUserSetting,
	ChangeChannelPositionRequest,
	UpdateChannelUserSettingRequest,
	ConnectedDevicesResponse,
	CreateChannelRequest,
	CreateEmojiRequest,
	CreateRoleRequest,
	CreateServerRequest,
	DropConnectionRequest,
	DropConnectionResponse,
	LinkPreviewWithImage,
	LoginRequest,
	LoginResponse,
	LoginServerRequest,
	MessageList,
	MessageReactionList,
	MessageSendPayload,
	MessageWithAttachment,
	NotificationList,
	PinnedMessageList,
	ReactionRequest,
	RegisterRequest,
	RegisterResponse,
	Role,
	SearchRequest,
	SearchResponse,
	Server,
	UpdateChannelPermissionsRequest,
	UpdateChannelPermissionsResponse,
	UpdateChannelRequest,
	UpdateAvatarRequest,
	UpdateBannerRequest,
	UpdateRoleRequest,
	UpdateServerRequest,
	UpdateUserRequest,
	UpdateStatusRequest,
	UserConfig,
	UserList,
	UserProfile,
	WhoamiResponse,
	BanUserRequest,
	ChangePasswordRequest,
	ReadNotificationRequest,
	AssignUserRoleRequest,
	AuditLogFilters,
	Emoji,
	AuditLogEntry,
	ICEServer,
} from './types';

// ── ApiError (RFC 7807) ─────────────────────────────────

export class ApiError extends Error {
	type: string;
	title: string;
	status: number;
	detail: string;
	instance: string | null;
	requestId: string | null;

	constructor(
		data:
			| {
					type?: string;
					title?: string;
					status?: number;
					detail?: string;
					instance?: string | null;
				}
			| string,
		requestId: string | null
	) {
		const d =
			typeof data === 'string'
				? { detail: data }
				: (data ?? {}) as Record<string, unknown>;
		const msg = String(d.detail ?? d.title ?? String(d));
		super(msg);
		this.name = 'ApiError';
		this.type =
			typeof d.type === 'string' ? d.type : 'about:blank';
		this.title =
			typeof d.title === 'string' ? d.title : 'Error';
		this.status =
			typeof d.status === 'number' ? d.status : 0;
		this.detail =
			typeof d.detail === 'string' ? d.detail : String(d.detail ?? '');
		this.instance = d.instance == null ? null : String(d.instance);
		this.requestId = requestId;
	}
}

// ── transport ───────────────────────────────────────────

type OnUnauthorized = () => void;
let unauthorizedHook: OnUnauthorized | null = null;

export function setOnUnauthorized(cb: OnUnauthorized): void {
	unauthorizedHook = cb;
}

export function clearOnUnauthorized(): void {
	unauthorizedHook = null;
}

function apiBase(): string {
	return (PUBLIC_API_URL ?? '').replace(/\/$/, '');
}

function buildUrl(path: string, query: string | null): string {
	const p = path.startsWith('/') ? path : `/${path}`;
	const url = new URL(apiBase() + p, window.location.origin ?? 'http://localhost');
	if (query) {
		url.search = query;
	}
	return url.href;
}

function serializeQuery(
	q: string | Record<string, string | number | null | undefined> | null | undefined
): string | null {
	if (!q) {
		return null;
	}
	if (typeof q === 'string') {
		return q;
	}
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(q)) {
		if (v == null) {
			continue;
		}
		params.append(k, String(v));
	}
	const s = params.toString();
	return s || null;
}

type RequestOpts = {
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	body?: unknown;
	query?: string | Record<string, string | number | null | undefined>;
	signal?: AbortSignal;
	raw?: boolean;
	// Skip the 401 → onUnauthorized hook. Used by public auth endpoints
	// (login / login_server / register) where a 401 means "bad password",
	// not an expired session.
	authFailure?: 'ignore';
};

// Preserve AbortError as-is (navigation/cancel), instead of wrapping it in
// an ApiError.
function isAbortError(e: unknown): boolean {
	return e instanceof Error && e.name === 'AbortError';
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
	const { method = 'GET', body, query, signal, raw = false, authFailure } = opts;
	const requestId = crypto.randomUUID();
	const q = serializeQuery(query);

	const headers: Record<string, string> = {
		'X-Request-ID': requestId,
		Accept: 'application/problem+json, application/json',
	};
	// FormData (multipart) keeps its own Content-Type (with boundary); we
	// must not override it with application/json.
	const isForm = body != null && body instanceof FormData;
	if (body != null && method !== 'GET' && !isForm) {
		headers['Content-Type'] = 'application/json';
	}

	let res: Response;
	try {
		res = await fetch(buildUrl(path, q), {
			method,
			headers,
			body:
				body != null && method !== 'GET'
					? isForm
						? body
						: JSON.stringify(body)
					: undefined,
			credentials: 'include',
			signal,
		});
	} catch (e) {
		if (isAbortError(e)) {
			throw e;
		}
		const detail =
			e instanceof Error ? e.message : String(e);
		throw new ApiError({ detail }, requestId);
	}

	if (res.status === 204) {
		return undefined as T;
	}

	if (res.status >= 400) {
		let data: unknown = {};
		try {
			const ct = res.headers.get('content-type') ?? '';
			if (ct.includes('json')) {
				data = await res.json();
			}
		} catch {
			data = {};
		}
		if (
			res.status === 401 &&
			authFailure !== 'ignore' &&
			unauthorizedHook
		) {
			unauthorizedHook();
		}
		throw new ApiError(data as any, requestId);
	}

	if (raw) {
		return res.text() as T;
	}
	if (res.type === 'opaque') {
		return res.text() as T;
	}
	return (await res.json()) as T;
}

// Binary fetch (attachments / media). Returns the Blob.
export async function fetchBlob(
	path: string,
	signal?: AbortSignal
): Promise<Blob> {
	const requestId = crypto.randomUUID();
	const url = buildUrl(path, null);
	let res: Response;
	try {
		res = await fetch(url, {
			headers: { 'X-Request-ID': requestId },
			credentials: 'include',
			signal,
		});
	} catch (e) {
		if (isAbortError(e)) {
			throw e;
		}
		const detail = e instanceof Error ? e.message : String(e);
		throw new ApiError({ detail }, requestId);
	}
	if (res.status >= 400) {
		let data: unknown = {};
		try {
			data = await res.json();
		} catch {
			data = {};
		}
		if (res.status === 401 && unauthorizedHook) {
			unauthorizedHook();
		}
		throw new ApiError(data as any, requestId);
	}
	return res.blob();
}

// ── health ──────────────────────────────────────────────

export const health = {
	// GET /health → plain text "OK" (no auth).
	ping(): Promise<string> {
		return request<string>('/health', { raw: true });
	},
};

// ── auth ────────────────────────────────────────────────

export const auth = {
	register(req: RegisterRequest): Promise<RegisterResponse> {
		return request<RegisterResponse>('/auth/register', {
			method: 'POST',
			body: req,
			authFailure: 'ignore',
		});
	},
	login(req: LoginRequest): Promise<LoginResponse> {
		return request<LoginResponse>('/auth/login', {
			method: 'POST',
			body: req,
			authFailure: 'ignore',
		});
	},
	loginServer(req: LoginServerRequest): Promise<void> {
		return request<void>('/auth/login_server', {
			method: 'POST',
			body: req,
			authFailure: 'ignore',
		});
	},
	whoami(): Promise<WhoamiResponse> {
		return request<WhoamiResponse>('/auth/whoami');
	},
	logout(): Promise<void> {
		return request<void>('/auth/logout', { method: 'POST' });
	},
	refresh(): Promise<{ connection: { id: string; created_at: string; expires_at: string } }> {
		return request<{ connection: { id: string; created_at: string; expires_at: string } }>(
			'/auth/refresh',
			{ method: 'POST' }
		);
	},
	connectedDevices(): Promise<ConnectedDevicesResponse> {
		return request<ConnectedDevicesResponse>('/auth/connected_devices');
	},
	dropConnection(req: DropConnectionRequest): Promise<DropConnectionResponse> {
		return request<DropConnectionResponse>('/auth/drop_connection', {
			method: 'POST',
			body: req,
		});
	},
};

// ── users ──────────────────────────────────────────────

export const users = {
	list(
		q?: { since?: string; last_id?: string }
	): Promise<UserList> {
		return request<UserList>('/users', { query: q });
	},
	profile(id: string): Promise<UserProfile> {
		return request<UserProfile>(`/users/${encodeURIComponent(id)}/profile`);
	},
	profileBatch(ids: string[]): Promise<{ profiles: UserProfile[] }> {
		return request<{ profiles: UserProfile[] }>('/users/profile_batch', {
			method: 'POST',
			body: { ids },
		});
	},
	update(id: string, req: UpdateUserRequest): Promise<{ response: string }> {
		return request<{ response: string }>(`/users/${encodeURIComponent(id)}`, {
			method: 'PUT',
			body: req,
		});
	},
	updateStatus(id: string, req: UpdateStatusRequest): Promise<{ response: string }> {
		return request<{ response: string }>(`/users/${encodeURIComponent(id)}/status`, {
			method: 'PUT',
			body: req,
		});
	},
	changePassword(id: string, req: ChangePasswordRequest): Promise<{ response: string }> {
		return request<{ response: string }>(`/users/${encodeURIComponent(id)}/password`, {
			method: 'PUT',
			body: req,
		});
	},
	updateSettings(config: UserConfig): Promise<{
		user_id: string;
		version: number;
		config: UserConfig;
		updated_at: string;
	}> {
		return request<{
			user_id: string;
			version: number;
			config: UserConfig;
			updated_at: string;
		}>('/users/settings', { method: 'PUT', body: { config } });
	},
	updateAvatar(id: string, req: UpdateAvatarRequest): Promise<{ response: string }> {
		return request<{ response: string }>(`/users/${encodeURIComponent(id)}/avatar`, {
			method: 'PUT',
			body: req,
		});
	},
	updateBanner(id: string, req: UpdateBannerRequest): Promise<{ response: string }> {
		return request<{ response: string }>(`/users/${encodeURIComponent(id)}/banner`, {
			method: 'PUT',
			body: req,
		});
	},
	ban(req: BanUserRequest): Promise<{ response: string }> {
		return request<{ response: string }>(`/users/${encodeURIComponent(req.user_id)}/ban`, {
			method: 'PUT',
			body: req,
		});
	},
	resetPassword(id: string): Promise<{ response: string }> {
		return request<{ response: string }>(`/users/${encodeURIComponent(id)}/reset`, {
			method: 'POST',
		});
	},
	notifications(
		id: string,
		q?: { since?: string; last_id?: string }
	): Promise<NotificationList> {
		return request<NotificationList>(`/users/${encodeURIComponent(id)}/notifications`, {
			query: q,
		});
	},
	markRead(id: string, req: ReadNotificationRequest): Promise<{ updated: number }> {
		return request<{ updated: number }>(`/users/${encodeURIComponent(id)}/read_notification`, {
			method: 'PUT',
			body: req,
		});
	},
	assignRole(userId: string, req: AssignUserRoleRequest): Promise<{
		user_id: string;
		role_id: string;
		assigned_at: string;
	}> {
		return request<{
			user_id: string;
			role_id: string;
			assigned_at: string;
		}>(`/users/${encodeURIComponent(userId)}/roles`, {
			method: 'POST',
			body: req,
		});
	},
	unassignRole(userId: string, roleId: string): Promise<void> {
		return request<void>(
			`/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
			{ method: 'DELETE' }
		);
	},
};

// ── server ─────────────────────────────────────────────

export const server = {
	// GET /server is public; 404 → null (server not created, F7).
	get(): Promise<Server | null> {
		return request<Server | null>('/server').then(
			(res) => (res == null ? null : res),
			(e) => {
				if (e instanceof ApiError && e.status === 404) {
					return null;
				}
				throw e;
			}
		);
	},
	create(req: CreateServerRequest): Promise<Server> {
		return request<Server>('/server', { method: 'POST', body: req });
	},
	update(req: UpdateServerRequest): Promise<Server> {
		return request<Server>('/server', { method: 'PUT', body: req });
	},
};

// ── channels ───────────────────────────────────────────

export const channels = {
	list(): Promise<Channel[]> {
		return request<{ channels: Channel[] }>('/channels').then(
			(res) => res.channels
		);
	},
	create(req: CreateChannelRequest): Promise<Channel> {
		return request<Channel>('/channels', { method: 'POST', body: req });
	},
	update(id: string, req: UpdateChannelRequest): Promise<Channel> {
		return request<Channel>(`/channels/${encodeURIComponent(id)}`, {
			method: 'PUT',
			body: req,
		});
	},
	changePosition(
		id: string,
		req: ChangeChannelPositionRequest
	): Promise<Channel> {
		return request<Channel>(`/channels/${encodeURIComponent(id)}/change_position`, {
			method: 'PUT',
			body: req,
		});
	},
	remove(id: string): Promise<void> {
		return request<void>(`/channels/${encodeURIComponent(id)}`, {
			method: 'DELETE',
		});
	},
	pinned(id: string): Promise<PinnedMessageList> {
		return request<PinnedMessageList>(`/channels/${encodeURIComponent(id)}/pinned`);
	},
	permissions(id: string): Promise<ChannelPermissionEntry[]> {
		return request<ChannelPermissionsResponse>(
			`/channels/${encodeURIComponent(id)}/permissions`
		).then((res) => res.permissions);
	},
	setRolePermissions(
		id: string,
		roleId: string,
		req: UpdateChannelPermissionsRequest
	): Promise<UpdateChannelPermissionsResponse> {
		return request<UpdateChannelPermissionsResponse>(
			`/channels/${encodeURIComponent(id)}/permissions/${encodeURIComponent(roleId)}`,
			{ method: 'PUT', body: req }
		);
	},
	setChannelUserSetting(
		channelId: string,
		userId: string,
		req: UpdateChannelUserSettingRequest
	): Promise<ChannelUserSetting> {
		return request<ChannelUserSetting>(
			`/channels/${encodeURIComponent(channelId)}/user/${encodeURIComponent(userId)}/settings`,
			{ method: 'POST', body: req }
		);
	},
};

// ── messages ───────────────────────────────────────────

export const messages = {
	list(
		channelId: string,
		q?: { since?: string; last_id?: string }
	): Promise<MessageList> {
		return request<MessageList>(`/channels/${encodeURIComponent(channelId)}/messages`, {
			query: q,
		});
	},
	// Multipart POST /messages (F13): fields channel_id, content, reply_to?,
	// and files under the repeated `attachments` field.
	send(payload: MessageSendPayload): Promise<MessageWithAttachment> {
		const form = new FormData();
		form.append('channel_id', payload.channel_id);
		if (payload.content != null) {
			form.append('content', payload.content);
		}
		if (payload.reply_to != null) {
			form.append('reply_to', payload.reply_to);
		}
		for (const f of payload.files ?? []) {
			form.append('attachments', f);
		}
		return request<MessageWithAttachment>('/messages', {
			method: 'POST',
			body: form,
		});
	},
	edit(messageId: string, req: { content: string }): Promise<MessageWithAttachment> {
		return request<MessageWithAttachment>(`/messages/${encodeURIComponent(messageId)}`, {
			method: 'PUT',
			body: req,
		});
	},
	remove(messageId: string): Promise<void> {
		return request<void>(`/messages/${encodeURIComponent(messageId)}`, {
			method: 'DELETE',
		});
	},
	pin(channelId: string, messageId: string): Promise<{
		channel_id: string;
		message_id: string;
		pinned_by: string | null;
		pinned_at: string;
	}> {
		return request<{
			channel_id: string;
			message_id: string;
			pinned_by: string | null;
			pinned_at: string;
		}>(
			`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/pin`,
			{ method: 'POST' }
		);
	},
	unpin(channelId: string, messageId: string): Promise<void> {
		return request<void>(
			`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/pin`,
			{ method: 'DELETE' }
		);
	},
	react(
		channelId: string,
		messageId: string,
		req: ReactionRequest
	): Promise<{
		id: string;
		user_id: string;
		emoji_id: string | null;
		unicode: string | null;
		created_at: string;
	}> {
		return request<{
			id: string;
			user_id: string;
			emoji_id: string | null;
			unicode: string | null;
			created_at: string;
		}>(
			`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions`,
			{ method: 'POST', body: req }
		);
	},
	unreact(
		channelId: string,
		messageId: string,
		req: ReactionRequest
	): Promise<void> {
		return request<void>(
			`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions`,
			{ method: 'DELETE', body: req }
		);
	},
	reactionUsers(
		channelId: string,
		messageId: string,
		q?: { since?: string; last_id?: string }
	): Promise<MessageReactionList> {
		return request<MessageReactionList>(
			`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions`,
			{ query: q }
		);
	},
};

// (fetchJson removed: request() now handles FormData directly.)

// ── linkPreviews ───────────────────────────────────────

export const linkPreviews = {
	get(previewId: string): Promise<LinkPreviewWithImage> {
		return request<LinkPreviewWithImage>(
			`/link-previews/${encodeURIComponent(previewId)}`
		);
	},
};

// ── roles ──────────────────────────────────────────────

export const roles = {
	list(): Promise<Role[]> {
		return request<{ roles: Role[] }>('/roles').then((res) => res.roles);
	},
	create(req: CreateRoleRequest): Promise<Role> {
		return request<Role>('/roles', { method: 'POST', body: req });
	},
	update(id: string, req: UpdateRoleRequest): Promise<Role> {
		return request<Role>(`/roles/${encodeURIComponent(id)}`, {
			method: 'PUT',
			body: req,
		});
	},
	remove(id: string): Promise<void> {
		return request<void>(`/roles/${encodeURIComponent(id)}`, {
			method: 'DELETE',
		});
	},
};

// ── emojis ─────────────────────────────────────────────

export const emojis = {
	list(
		q?: { since?: string; last_id?: string }
	): Promise<{ emojis: Emoji[]; has_more: boolean }> {
		return request<{ emojis: Emoji[]; has_more: boolean }>('/emojis', {
			query: q,
		});
	},
	create(req: CreateEmojiRequest): Promise<Emoji> {
		return request<Emoji>('/emojis', { method: 'POST', body: req });
	},
	remove(id: string): Promise<void> {
		return request<void>(`/emojis/${encodeURIComponent(id)}`, {
			method: 'DELETE',
		});
	},
};

// ── search ─────────────────────────────────────────────

export const search = {
	search(
		req: SearchRequest,
		q?: { since?: string; last_id?: string }
	): Promise<SearchResponse> {
		return request<SearchResponse>('/search', {
			method: 'POST',
			body: req,
			query: q,
		});
	},
};

// ── admin ──────────────────────────────────────────────

export const admin = {
	auditLogs(
		filters: AuditLogFilters,
		q?: { since?: string; until?: string; last_id?: string }
	): Promise<{ logs: AuditLogEntry[]; has_more: boolean }> {
		const all: Record<string, string | null> = {
			...filters,
			...q,
		};
		return request<{ logs: AuditLogEntry[]; has_more: boolean }>('/admin/audit-logs', {
			query: all,
		});
	},
};

// ── voice ──────────────────────────────────────────────

export const voice = {
	iceServers(): Promise<{ ice_servers: ICEServer[] }> {
		return request<{ ice_servers: ICEServer[] }>('/voice/ice-servers');
	},
};

export const api = {
	health,
	auth,
	users,
	server,
	channels,
	messages,
	linkPreviews,
	roles,
	emojis,
	search,
	admin,
	voice,
};

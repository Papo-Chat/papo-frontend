import type {
	LinkPreviewWithImage,
	MessageAttachment,
	VoiceState,
} from './models';

// ── shared ─────────────────────────────────────────────

export type PresenceStatus = 'online' | 'offline' | 'away' | 'busy';

export interface PresenceMember {
	user_id: string;
	status: PresenceStatus;
	status_message: string | null;
}

export interface VoiceError {
	// Reused by the generic `error` event and dedicated voice errors.
	type: 'error';
	message: string;
	code: VoiceErrorCode | null;
}

// The 8 machine-readable voice error codes (F20).
export type VoiceErrorCode =
	| 'voice-not-found'
	| 'voice-forbidden'
	| 'voice-room-full'
	| 'voice-already-in-room'
	| 'voice-codec-unsupported'
	| 'voice-invalid-sdp'
	| 'voice-rate-limited'
	| 'voice-room-closed';

// ── outbound (server → client, 29 types, F24) ──────────

// message — F1: no reactions/previews/user_reactions.
export interface WsMessage {
	type: 'message';
	id: string;
	channel_id: string;
	author_id: string;
	content: string;
	created_at: string;
	reply_to: string | null;
	attachments?: MessageAttachment[];
}

// message_edit
export interface WsMessageEdit {
	type: 'message_edit';
	id: string;
	channel_id: string;
	content: string;
	edited_at: string;
}

// message_delete
export interface WsMessageDelete {
	type: 'message_delete';
	id: string;
	channel_id: string;
}

// message_pin — no channel_id.
export interface WsMessagePin {
	type: 'message_pin';
	message_id: string;
	is_pinned: boolean;
}

// channel_create — F4: no permissions/created_at.
export interface WsChannelCreate {
	type: 'channel_create';
	channel_id: string;
	name: string;
	channel_type: 'text' | 'category' | 'voice';
	position: number;
	topic: string | null;
}

// channel_update
export interface WsChannelUpdate {
	type: 'channel_update';
	channel_id: string;
	name: string;
	position: number;
	topic: string | null;
}

// channel_delete
export interface WsChannelDelete {
	type: 'channel_delete';
	channel_id: string;
}

// typing
export interface WsTyping {
	type: 'typing';
	channel_id: string;
	user_id: string;
	is_typing: boolean;
}

// avatar_update
export interface WsAvatarUpdate {
	type: 'avatar_update';
	user_id: string;
}

// presence_update
export interface WsPresenceUpdate {
	type: 'presence_update';
	user_id: string;
	status: PresenceStatus;
	status_message: string | null;
	typing: string | null;
	nickname: string | null;
}

// presence_sync — unicast on connect.
export interface WsPresenceSync {
	type: 'presence_sync';
	members: PresenceMember[];
}

// heartbeat_ack
export interface WsHeartbeatAck {
	type: 'heartbeat_ack';
}

// error
export interface WsError {
	type: 'error';
	message: string;
	code: string | null;
}

// new_preview — no channel_id (F25).
export interface WsNewPreview {
	type: 'new_preview';
	message_id: string;
	preview_id: string;
}

// remove_preview — no channel_id (F25).
export interface WsRemovePreview {
	type: 'remove_preview';
	message_id: string;
	preview_id: string;
}

// link_preview_update — carries the full preview.
export interface WsLinkPreviewUpdate {
	type: 'link_preview_update';
	channel_id: string;
	message_id: string;
	preview: LinkPreviewWithImage;
}

// user_join
export interface WsUserJoin {
	type: 'user_join';
	user_id: string;
}

// react_update — no channel_id, no user_id (F2).
export interface WsReactUpdate {
	type: 'react_update';
	message_id: string;
	emoji_id: string | null;
	unicode: string | null;
	count: number;
}

// new_notification — unicast; id may be ephemeral (F3).
export interface WsNewNotification {
	type: 'new_notification';
	id: string;
	// author of the message.
	user_id: string;
	message_id: string;
	// Truncated to 512 chars.
	message_content: string;
}

// role_add — no role name/color (client must refetch).
export interface WsRoleAdd {
	type: 'role_add';
	user_id: string;
	role_id: string;
}

// role_remove
export interface WsRoleRemove {
	type: 'role_remove';
	user_id: string;
	role_id: string;
}

// attachment_moderation_update
export interface WsAttachmentModerationUpdate {
	type: 'attachment_moderation_update';
	channel_id: string;
	message_id: string;
	attachment_id: string;
	status: string;
}

// voice_joined — unicast to the joining connection.
export interface WsVoiceJoined {
	type: 'voice_joined';
	channel_id: string;
	members: VoiceState[];
	active_speakers: string[];
}

// voice_answer — unicast.
export interface WsVoiceAnswer {
	type: 'voice_answer';
	channel_id: string;
	sdp: string;
}

// voice_offer — server-initiated renegotiation.
export interface WsVoiceOffer {
	type: 'voice_offer';
	channel_id: string;
	sdp: string;
}

// voice_ice_candidate — unicast.
export interface WsVoiceIceCandidate {
	type: 'voice_ice_candidate';
	channel_id: string;
	candidate: string;
	sdp_mid: string | null;
	sdp_mline_index: number | null;
}

// voice_state_update
export interface WsVoiceStateUpdate {
	type: 'voice_state_update';
	channel_id: string;
	user_id: string;
	muted: boolean;
	camera_on: boolean;
	screen_sharing: boolean;
}

// voice_leave
export interface WsVoiceLeave {
	type: 'voice_leave';
	channel_id: string;
	user_id: string;
}

// active_speaker_update
export interface WsActiveSpeakerUpdate {
	type: 'active_speaker_update';
	channel_id: string;
	user_ids: string[];
}

export type WsOutbound =
	| WsMessage
	| WsMessageEdit
	| WsMessageDelete
	| WsMessagePin
	| WsChannelCreate
	| WsChannelUpdate
	| WsChannelDelete
	| WsTyping
	| WsAvatarUpdate
	| WsPresenceUpdate
	| WsPresenceSync
	| WsHeartbeatAck
	| WsError
	| WsNewPreview
	| WsRemovePreview
	| WsLinkPreviewUpdate
	| WsUserJoin
	| WsReactUpdate
	| WsNewNotification
	| WsRoleAdd
	| WsRoleRemove
	| WsAttachmentModerationUpdate
	| WsVoiceJoined
	| WsVoiceAnswer
	| WsVoiceOffer
	| WsVoiceIceCandidate
	| WsVoiceStateUpdate
	| WsVoiceLeave
	| WsActiveSpeakerUpdate;

// ── inbound (client → server, 13 types, F24) ──────────

// typing
export interface WsTypingInbound {
	type: 'typing';
	channel_id: string;
}

// heartbeat
export interface WsHeartbeat {
	type: 'heartbeat';
}

// voice_join
export interface WsVoiceJoin {
	type: 'voice_join';
	channel_id: string;
}

// voice_leave
export interface WsVoiceLeaveInbound {
	type: 'voice_leave';
	channel_id: string;
}

// voice_offer
export interface WsVoiceOfferInbound {
	type: 'voice_offer';
	channel_id: string;
	sdp: string;
}

// voice_answer
export interface WsVoiceAnswerInbound {
	type: 'voice_answer';
	channel_id: string;
	sdp: string;
}

// voice_ice_candidate
export interface WsVoiceIceCandidateInbound {
	type: 'voice_ice_candidate';
	channel_id: string;
	candidate: string;
	sdp_mid: string | null;
	sdp_mline_index: number | null;
}

// track_subscribe
export interface WsTrackSubscribe {
	type: 'track_subscribe';
	channel_id: string;
	publisher_id: string;
	kind: 'video' | 'screen';
}

// track_unsubscribe
export interface WsTrackUnsubscribe {
	type: 'track_unsubscribe';
	channel_id: string;
	publisher_id: string;
	kind: 'video' | 'screen';
}

// voice_mute
export interface WsVoiceMute {
	type: 'voice_mute';
	channel_id: string;
	muted: boolean;
}

// voice_camera
export interface WsVoiceCamera {
	type: 'voice_camera';
	channel_id: string;
	on: boolean;
}

// screen_share_start
export interface WsScreenShareStart {
	type: 'screen_share_start';
	channel_id: string;
}

// screen_share_stop
export interface WsScreenShareStop {
	type: 'screen_share_stop';
	channel_id: string;
}

export type WsInbound =
	| WsTypingInbound
	| WsHeartbeat
	| WsVoiceJoin
	| WsVoiceLeaveInbound
	| WsVoiceOfferInbound
	| WsVoiceAnswerInbound
	| WsVoiceIceCandidateInbound
	| WsTrackSubscribe
	| WsTrackUnsubscribe
	| WsVoiceMute
	| WsVoiceCamera
	| WsScreenShareStart
	| WsScreenShareStop;

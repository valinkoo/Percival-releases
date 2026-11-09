import type { ChannelDto } from './channels.js';
import type { MessageDto } from './messages.js';

/** The author of a "typing" signal, as other clients display it. */
export interface TypingUserDto {
  id: string;
  username: string;
}

export interface UserTypingEvent {
  channelId: string;
  user: TypingUserDto;
}

export interface MessageDeletedEvent {
  id: string;
  channelId: string;
}

/** Events pushed by the server over Socket.io. */
export interface ServerToClientEvents {
  new_message: (message: MessageDto) => void;
  /** A message was edited by its author. Carries the whole message. */
  message_updated: (message: MessageDto) => void;
  message_deleted: (event: MessageDeletedEvent) => void;
  /** Someone else is typing in a channel. Never sent back to the person typing. */
  user_typing: (event: UserTypingEvent) => void;
  channel_created: (channel: ChannelDto) => void;
}

/**
 * Events sent by clients. Messages themselves are posted through the REST API, so that
 * validation, permissions and errors share one code path with bots and webhooks; only the
 * ephemeral typing signal goes over the socket.
 */
export interface ClientToServerEvents {
  typing: (payload: { channelId: string }) => void;
}

/** The client authenticates the Socket.io handshake with its JWT: `auth: { token }`. */
export interface SocketAuth {
  token: string;
}

/** A client announces it is typing at most this often while the user keeps typing. */
export const TYPING_SEND_INTERVAL_MS = 3000;

/** A "typing" indicator disappears if no new signal arrives within this delay. */
export const TYPING_EXPIRES_MS = 5000;

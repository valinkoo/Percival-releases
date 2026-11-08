import type { ChannelDto } from './channels.js';
import type { MessageDto } from './messages.js';

/** Events pushed by the server over Socket.io. */
export interface ServerToClientEvents {
  new_message: (message: MessageDto) => void;
  channel_created: (channel: ChannelDto) => void;
}

/**
 * Events sent by clients. None for now: messages are posted through the REST API, so that
 * validation, permissions and errors share one code path with bots and webhooks.
 */
export type ClientToServerEvents = Record<string, never>;

/** The client authenticates the Socket.io handshake with its JWT: `auth: { token }`. */
export interface SocketAuth {
  token: string;
}

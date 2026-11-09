import type {
  ChannelDto,
  ClientToServerEvents,
  MessageDeletedEvent,
  MessageDto,
  ServerToClientEvents,
  SocketAuth,
  UserTypingEvent,
} from '@percival/shared';
import { io, type Socket } from 'socket.io-client';

export type ConnectionState = 'connecting' | 'connected' | 'offline';

export interface RealtimeHandlers {
  onState(state: ConnectionState): void;
  onMessage(message: MessageDto): void;
  onMessageUpdated(message: MessageDto): void;
  onMessageDeleted(event: MessageDeletedEvent): void;
  onTyping(event: UserTypingEvent): void;
  onChannel(channel: ChannelDto): void;
  /** The connection came back after a loss: events may have been missed in between. */
  onResume(): void;
  /** The server refused the token (expired, or the account no longer exists). */
  onUnauthorized(): void;
}

export interface RealtimeConnection {
  /** Tells the other members of a channel that this user is typing. */
  sendTyping(channelId: string): void;
  close(): void;
}

/** Delay before reconnecting after the server closed the connection on purpose. */
const SERVER_CLOSE_RETRY_MS = 1000;

/**
 * Socket.io connection with the session token. Network losses are retried by Socket.io itself;
 * a connection closed by the server (restart, or the token expiring) is retried by hand, and
 * only a refused token ends the session.
 */
export function connectRealtime(
  serverUrl: string,
  token: string,
  handlers: RealtimeHandlers,
): RealtimeConnection {
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
    // WebSocket only: no long-polling fallback, which keeps the CSP and the proxies simple.
    transports: ['websocket'],
    auth: { token } satisfies SocketAuth,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  let closed = false;
  let wasConnected = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  handlers.onState('connecting');

  socket.on('connect', () => {
    handlers.onState('connected');
    if (wasConnected) handlers.onResume();
    wasConnected = true;
  });

  socket.on('disconnect', (reason) => {
    if (closed) return;
    handlers.onState('offline');
    if (reason === 'io server disconnect') {
      retryTimer = setTimeout(() => socket.connect(), SERVER_CLOSE_RETRY_MS);
    }
  });

  socket.on('connect_error', (error) => {
    if (closed) return;
    if (error.message === 'unauthorized') {
      handlers.onUnauthorized();
      return;
    }
    handlers.onState('offline');
    // A refusal by the server's handshake is not retried by Socket.io; transport errors are.
    if (!socket.active) {
      retryTimer = setTimeout(() => socket.connect(), SERVER_CLOSE_RETRY_MS * 3);
    }
  });

  socket.on('new_message', (message) => handlers.onMessage(message));
  socket.on('message_updated', (message) => handlers.onMessageUpdated(message));
  socket.on('message_deleted', (event) => handlers.onMessageDeleted(event));
  socket.on('user_typing', (event) => handlers.onTyping(event));
  socket.on('channel_created', (channel) => handlers.onChannel(channel));

  return {
    sendTyping(channelId) {
      // A signal sent while offline is useless by the time the connection is back.
      if (socket.connected) socket.emit('typing', { channelId });
    },
    close() {
      closed = true;
      clearTimeout(retryTimer);
      socket.close();
    },
  };
}

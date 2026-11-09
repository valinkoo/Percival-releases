import type {
  ChannelDto,
  ClientToServerEvents,
  MessageDeletedEvent,
  MessageDto,
  ServerToClientEvents,
} from '@percival/shared';
import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { canViewChannel, listAccessibleChannels } from '../channels/access.js';
import { loadAccount, type Account } from '../users/account.js';

interface SocketData {
  account: Account;
  /** JWT expiry, in milliseconds since the epoch. */
  expiresAt: number;
  /** Channels visible to the account when it connected. */
  channelIds: string[];
}

type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const channelRoom = (channelId: string): string => `channel:${channelId}`;

/** Clients throttle their own "typing" signals; this only protects the server from a noisy one. */
const TYPING_MIN_GAP_MS = 1000;

export interface Realtime {
  /** Pushes a stored message to every socket in the channel's room. */
  publishMessage(message: MessageDto): void;
  /** Tells the channel's room that a message was edited. */
  publishMessageUpdated(message: MessageDto): void;
  /** Tells the channel's room that a message was deleted. */
  publishMessageDeleted(event: MessageDeletedEvent): void;
  /** Tells every socket allowed to see the new channel about it, and subscribes them. */
  publishChannel(channel: ChannelDto): Promise<void>;
  close(): Promise<void>;
}

/**
 * Socket.io on top of Fastify's HTTP server.
 *
 * - The handshake carries the JWT (`auth: { token }`); the account is reloaded from the database.
 * - A connected socket is subscribed to the room of every channel it can see.
 * - The connection ends when the JWT expires, so a stolen or stale token cannot stay online.
 */
export function createRealtime(app: FastifyInstance): Realtime {
  const io: RealtimeServer = new Server(app.server, {
    cors: { origin: app.config.CORS_ORIGINS, methods: ['GET', 'POST'] },
    serveClient: false,
  });

  io.use(async (socket, next) => {
    try {
      const token: unknown = socket.handshake.auth['token'];
      if (typeof token !== 'string' || token === '') {
        throw new Error('missing token');
      }
      const payload = app.jwt.verify<{ sub: string; exp: number }>(token);
      const account = await loadAccount(app.prisma, payload.sub);
      if (!account) {
        throw new Error('unknown account');
      }
      const channels = await listAccessibleChannels(app.prisma, account);
      socket.data.account = account;
      socket.data.expiresAt = payload.exp * 1000;
      socket.data.channelIds = channels.map((channel) => channel.id);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { channelIds, expiresAt } = socket.data;

    // Joined in the same tick as the connection, before the client can receive anything, so no
    // message published right after the handshake is missed.
    void socket.join(channelIds.map(channelRoom));

    // "Typing" signals are relayed to the other members of the channel. A socket can only signal
    // in the channels it is subscribed to, and no more than once a second per channel.
    const lastTypingAt = new Map<string, number>();
    socket.on('typing', (payload) => {
      const channelId: unknown = (payload as { channelId?: unknown } | null)?.channelId;
      if (typeof channelId !== 'string' || !socket.rooms.has(channelRoom(channelId))) return;
      const now = Date.now();
      if (now - (lastTypingAt.get(channelId) ?? 0) < TYPING_MIN_GAP_MS) return;
      lastTypingAt.set(channelId, now);
      const { id, username } = socket.data.account;
      socket.to(channelRoom(channelId)).emit('user_typing', { channelId, user: { id, username } });
    });

    const timer = setTimeout(() => socket.disconnect(true), Math.max(0, expiresAt - Date.now()));
    timer.unref();
    socket.on('disconnect', () => clearTimeout(timer));
  });

  return {
    publishMessage(message) {
      io.to(channelRoom(message.channelId)).emit('new_message', message);
    },

    publishMessageUpdated(message) {
      io.to(channelRoom(message.channelId)).emit('message_updated', message);
    },

    publishMessageDeleted(event) {
      io.to(channelRoom(event.channelId)).emit('message_deleted', event);
    },

    async publishChannel(channel) {
      for (const socket of await io.fetchSockets()) {
        // A brand new channel has no members yet, so only the public rule can apply.
        if (canViewChannel(socket.data.account, channel, false)) {
          socket.join(channelRoom(channel.id));
          socket.emit('channel_created', channel);
        }
      }
    },

    async close() {
      io.local.disconnectSockets(true);
      await io.close();
    },
  };
}

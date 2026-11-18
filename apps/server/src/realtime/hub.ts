import type {
  ChannelDto,
  ClientToServerEvents,
  MessageDeletedEvent,
  MessageDto,
  ServerToClientEvents,
  UserDto,
} from '@percival/shared';
import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { canViewChannel, listAccessibleChannels } from '../channels/access.js';
import { toChannelDto } from '../channels/serialize.js';
import { isRevoked, loadAccountState, type Account } from '../users/account.js';

interface SocketData {
  account: Account;
  /** JWT expiry, in milliseconds since the epoch. */
  expiresAt: number;
  /** JWT issue time, in seconds since the epoch: what a session revocation is compared with. */
  issuedAt: number;
  /** Channels visible to the account when it connected. */
  channelIds: string[];
}

type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const CHANNEL_ROOM_PREFIX = 'channel:';
const channelRoom = (channelId: string): string => `${CHANNEL_ROOM_PREFIX}${channelId}`;

/** Clients throttle their own "typing" signals; this only protects the server from a noisy one. */
const TYPING_MIN_GAP_MS = 1000;

/** Handshake refusals the client tells apart from a plain "unauthorized". */
const SPECIFIC_REFUSALS = new Set(['account_disabled', 'password_change_required']);

export interface Realtime {
  /** Pushes a stored message to every socket in the channel's room. */
  publishMessage(message: MessageDto): void;
  /** Tells the channel's room that a message was edited. */
  publishMessageUpdated(message: MessageDto): void;
  /** Tells the channel's room that a message was deleted. */
  publishMessageDeleted(event: MessageDeletedEvent): void;
  /**
   * Tells every socket allowed to see the new channel about it, and subscribes them.
   * `memberIds` are the accounts already listed as members when the channel is created.
   */
  publishChannel(channel: ChannelDto, memberIds?: readonly string[]): Promise<void>;
  /** Tells the channel's room that the channel was renamed or its description changed. */
  publishChannelUpdated(channel: ChannelDto): void;
  /** Tells every connection of the account that its own account changed. */
  publishAccountUpdated(user: UserDto): void;
  /**
   * Recomputes the channels an account can see (its role or memberships changed) and updates its
   * connections: subscribes them to the new ones and drops the others, telling the client.
   */
  syncUser(userId: string): Promise<void>;
  /** Closes every connection of the account (it was disabled). */
  disconnectUser(userId: string): void;
  /**
   * Closes the connections of the account that were opened with a token issued before `before`
   * (its password changed or was reset).
   */
  closeSessionsBefore(userId: string, before: Date): void;
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

  /** The live connections of one account (there may be several: other devices, a restart). */
  const socketsOf = (userId: string) =>
    [...io.sockets.sockets.values()].filter((socket) => socket.data.account.id === userId);

  io.use(async (socket, next) => {
    try {
      const token: unknown = socket.handshake.auth['token'];
      if (typeof token !== 'string' || token === '') {
        throw new Error('missing token');
      }
      const payload = app.jwt.verify<{ sub: string; iat: number; exp: number }>(token);
      const state = await loadAccountState(app.prisma, payload.sub);
      if (!state) {
        throw new Error('unknown account');
      }
      if (state.disabled) {
        throw new Error('account_disabled');
      }
      if (isRevoked(state, payload.iat)) {
        throw new Error('session closed');
      }
      if (state.account.mustChangePassword) {
        throw new Error('password_change_required');
      }
      const channels = await listAccessibleChannels(app.prisma, state.account);
      socket.data.account = state.account;
      socket.data.expiresAt = payload.exp * 1000;
      socket.data.issuedAt = payload.iat;
      socket.data.channelIds = channels.map((channel) => channel.id);
      next();
    } catch (error) {
      const refusal = error instanceof Error && SPECIFIC_REFUSALS.has(error.message);
      next(new Error(refusal ? error.message : 'unauthorized'));
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

    async publishChannel(channel, memberIds = []) {
      for (const socket of io.sockets.sockets.values()) {
        const isMember = memberIds.includes(socket.data.account.id);
        if (canViewChannel(socket.data.account, channel, isMember)) {
          await socket.join(channelRoom(channel.id));
          socket.emit('channel_created', channel);
        }
      }
    },

    publishChannelUpdated(channel) {
      io.to(channelRoom(channel.id)).emit('channel_updated', channel);
    },

    publishAccountUpdated(user) {
      for (const socket of socketsOf(user.id)) {
        socket.emit('account_updated', user);
      }
    },

    async syncUser(userId) {
      const sockets = socketsOf(userId);
      if (sockets.length === 0) return;
      const state = await loadAccountState(app.prisma, userId);
      if (!state) return;
      const visible = new Map(
        (await listAccessibleChannels(app.prisma, state.account)).map((channel) => [
          channel.id,
          channel,
        ]),
      );
      for (const socket of sockets) {
        socket.data.account = state.account;
        const subscribed = new Set(
          [...socket.rooms]
            .filter((room) => room.startsWith(CHANNEL_ROOM_PREFIX))
            .map((room) => room.slice(CHANNEL_ROOM_PREFIX.length)),
        );
        for (const [channelId, channel] of visible) {
          if (subscribed.has(channelId)) continue;
          await socket.join(channelRoom(channelId));
          socket.emit('channel_created', toChannelDto(channel));
        }
        for (const channelId of subscribed) {
          if (visible.has(channelId)) continue;
          await socket.leave(channelRoom(channelId));
          socket.emit('channel_removed', { id: channelId });
        }
      }
    },

    disconnectUser(userId) {
      for (const socket of socketsOf(userId)) socket.disconnect(true);
    },

    closeSessionsBefore(userId, before) {
      const bound = Math.floor(before.getTime() / 1000);
      for (const socket of socketsOf(userId)) {
        if (socket.data.issuedAt < bound) socket.disconnect(true);
      }
    },

    async close() {
      io.local.disconnectSockets(true);
      await io.close();
    },
  };
}

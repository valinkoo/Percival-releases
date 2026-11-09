import type {
  ChannelDto,
  ClientToServerEvents,
  MessageDeletedEvent,
  MessageDto,
  ServerToClientEvents,
  UserTypingEvent,
} from '@percival/shared';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  authHeader,
  createTestContext,
  createUser,
  tokenFor,
  type TestContext,
} from './helpers/app.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

describe('realtime', () => {
  let ctx: TestContext;
  let baseUrl: string;
  let generalId: string;
  let privateId: string;
  let admin: { id: string; token: string };
  let member: { id: string; token: string };
  let guest: { id: string; token: string };
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    ctx = await createTestContext();
    await ctx.app.listen({ host: '127.0.0.1', port: 0 });
    const address = ctx.app.server.address();
    if (typeof address !== 'object' || address === null) throw new Error('no address');
    baseUrl = `http://127.0.0.1:${address.port}`;

    const a = await createUser(ctx.prisma, 'admin', 'admin');
    const m = await createUser(ctx.prisma, 'member', 'member');
    const g = await createUser(ctx.prisma, 'guest', 'guest');
    admin = { id: a.id, token: tokenFor(ctx.app, a.id) };
    member = { id: m.id, token: tokenFor(ctx.app, m.id) };
    guest = { id: g.id, token: tokenFor(ctx.app, g.id) };

    generalId = (await ctx.prisma.channel.findFirstOrThrow({ where: { name: 'general' } })).id;
    privateId = (await ctx.prisma.channel.create({ data: { name: 'secret', isPrivate: true } })).id;
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.close();
  });
  afterAll(async () => ctx.close());

  function connect(token: string | undefined): Promise<ClientSocket> {
    const socket: ClientSocket = io(baseUrl, {
      transports: ['websocket'],
      auth: token === undefined ? {} : { token },
      reconnection: false,
    });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  /** Collects what a socket receives, to assert on it after the server had time to deliver. */
  function listen(socket: ClientSocket) {
    const messages: MessageDto[] = [];
    const updated: MessageDto[] = [];
    const deleted: MessageDeletedEvent[] = [];
    const typing: UserTypingEvent[] = [];
    const channels: ChannelDto[] = [];
    socket.on('new_message', (message) => messages.push(message));
    socket.on('message_updated', (message) => updated.push(message));
    socket.on('message_deleted', (event) => deleted.push(event));
    socket.on('user_typing', (event) => typing.push(event));
    socket.on('channel_created', (channel) => channels.push(channel));
    return { messages, updated, deleted, typing, channels };
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Waits until something arrives (events travel over a real socket, so it takes a moment). */
  async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition() && Date.now() < deadline) await sleep(20);
  }

  /** Leaves time for events that must NOT arrive to show up, if they were going to. */
  const settle = () => sleep(300);

  const post = (token: string, channelId: string, content: string) =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${channelId}/messages`,
      headers: authHeader(token),
      payload: { content },
    });

  it('refuses connections without a valid token', async () => {
    await expect(connect(undefined)).rejects.toThrow('unauthorized');
    await expect(connect('garbage')).rejects.toThrow('unauthorized');
    await expect(connect(`${member.token}x`)).rejects.toThrow('unauthorized');
  });

  it('refuses a token whose account no longer exists', async () => {
    const ghost = await createUser(ctx.prisma, 'ghost', 'member');
    const token = tokenFor(ctx.app, ghost.id);
    await ctx.prisma.user.delete({ where: { id: ghost.id } });
    await expect(connect(token)).rejects.toThrow('unauthorized');
  });

  it('delivers a new message to everyone who can see the channel, sender included', async () => {
    const memberSocket = await connect(member.token);
    const adminSocket = await connect(admin.token);
    const received = { member: listen(memberSocket), admin: listen(adminSocket) };

    const response = await post(member.token, generalId, 'salut **tous**');
    expect(response.statusCode).toBe(201);
    await waitFor(() => received.member.messages.length > 0 && received.admin.messages.length > 0);
    await settle(); // and nothing is delivered twice

    for (const { messages } of Object.values(received)) {
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        channelId: generalId,
        content: 'salut **tous**',
        author: { username: 'member' },
      });
    }
  });

  it('does not deliver messages of channels the user cannot see', async () => {
    const memberSocket = await connect(member.token);
    const guestSocket = await connect(guest.token);
    const adminSocket = await connect(admin.token);
    const received = {
      member: listen(memberSocket),
      guest: listen(guestSocket),
      admin: listen(adminSocket),
    };

    await post(admin.token, privateId, 'confidentiel');
    await post(admin.token, generalId, 'public');
    await waitFor(
      () => received.admin.messages.length === 2 && received.member.messages.length > 0,
    );
    await settle();

    expect(received.member.messages.map((message) => message.content)).toEqual(['public']);
    expect(received.guest.messages).toEqual([]); // guests only get assigned channels
    expect(received.admin.messages.map((message) => message.content)).toEqual([
      'confidentiel',
      'public',
    ]);
  });

  it('delivers messages of a channel a guest was assigned to', async () => {
    const assigned = await ctx.prisma.channel.create({ data: { name: 'client' } });
    await ctx.prisma.channelMember.create({ data: { channelId: assigned.id, userId: guest.id } });
    const guestSocket = await connect(guest.token);
    const { messages } = listen(guestSocket);

    await post(admin.token, assigned.id, 'bonjour le client');
    await waitFor(() => messages.length > 0);
    await settle();
    expect(messages.map((message) => message.content)).toEqual(['bonjour le client']);
  });

  it('announces new channels to the sockets allowed to see them', async () => {
    const memberSocket = await connect(member.token);
    const guestSocket = await connect(guest.token);
    const received = { member: listen(memberSocket), guest: listen(guestSocket) };

    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/channels',
      headers: authHeader(admin.token),
      payload: { name: 'nouveau' },
    });
    expect(created.statusCode).toBe(201);
    await waitFor(() => received.member.channels.length > 0);
    await settle();

    expect(received.member.channels.map((channel) => channel.name)).toEqual(['nouveau']);
    expect(received.guest.channels).toEqual([]);

    // The member is now subscribed to the new channel without reconnecting.
    const newChannelId = received.member.channels[0]?.id ?? '';
    expect((await post(admin.token, newChannelId, 'premier message')).statusCode).toBe(201);
    await waitFor(() => received.member.messages.length > 0);
    await settle();
    expect(received.member.messages.map((message) => message.content)).toEqual(['premier message']);
  });

  it('pushes edits and deletions to everyone who can see the channel, and only them', async () => {
    const memberSocket = await connect(member.token);
    const adminSocket = await connect(admin.token);
    const guestSocket = await connect(guest.token);
    const received = {
      member: listen(memberSocket),
      admin: listen(adminSocket),
      guest: listen(guestSocket),
    };

    const created = await post(member.token, generalId, 'brouillon');
    const { message } = created.json<{ message: MessageDto }>();

    const edited = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/channels/${generalId}/messages/${message.id}`,
      headers: authHeader(member.token),
      payload: { content: 'version finale' },
    });
    expect(edited.statusCode).toBe(200);
    await waitFor(() => received.member.updated.length > 0 && received.admin.updated.length > 0);

    const removed = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/channels/${generalId}/messages/${message.id}`,
      headers: authHeader(member.token),
    });
    expect(removed.statusCode).toBe(200);
    await waitFor(() => received.member.deleted.length > 0 && received.admin.deleted.length > 0);
    await settle(); // and nothing is delivered twice, or to the guest

    for (const { updated, deleted } of [received.member, received.admin]) {
      expect(updated).toHaveLength(1);
      expect(updated[0]).toMatchObject({ id: message.id, content: 'version finale' });
      expect(updated[0]?.editedAt).not.toBeNull();
      expect(deleted).toEqual([{ id: message.id, channelId: generalId }]);
    }
    expect(received.guest.updated).toEqual([]);
    expect(received.guest.deleted).toEqual([]);
  });

  it('relays "typing" to the other members of the channel, never back to the sender', async () => {
    const memberSocket = await connect(member.token);
    const adminSocket = await connect(admin.token);
    const guestSocket = await connect(guest.token);
    const received = {
      member: listen(memberSocket),
      admin: listen(adminSocket),
      guest: listen(guestSocket),
    };

    memberSocket.emit('typing', { channelId: generalId });
    await waitFor(() => received.admin.typing.length > 0);
    await settle();

    expect(received.admin.typing).toEqual([
      { channelId: generalId, user: { id: member.id, username: 'member' } },
    ]);
    expect(received.member.typing).toEqual([]);
    expect(received.guest.typing).toEqual([]); // guests do not see general
  });

  it('ignores "typing" for channels the sender cannot see, and malformed signals', async () => {
    const memberSocket = await connect(member.token);
    const guestSocket = await connect(guest.token);
    const adminSocket = await connect(admin.token);
    const { typing } = listen(adminSocket);

    memberSocket.emit('typing', { channelId: privateId }); // members cannot see it
    guestSocket.emit('typing', { channelId: generalId }); // guests cannot see it either
    memberSocket.emit('typing', { channelId: 42 } as never);
    memberSocket.emit('typing', null as never);
    memberSocket.emit('typing', { channelId: 'channel:not-a-room' });
    await settle();

    expect(typing).toEqual([]);
  });

  it('throttles repeated "typing" signals of one sender in one channel', async () => {
    const memberSocket = await connect(member.token);
    const adminSocket = await connect(admin.token);
    const { typing } = listen(adminSocket);

    for (let i = 0; i < 5; i++) memberSocket.emit('typing', { channelId: generalId });
    await waitFor(() => typing.length > 0);
    await settle();

    expect(typing).toHaveLength(1);
  });

  it('disconnects a socket when its token expires', async () => {
    const shortLived = tokenFor(ctx.app, member.id, '2s');
    const socket = await connect(shortLived);
    const disconnected = new Promise<string>((resolve) => socket.on('disconnect', resolve));
    const reason = await Promise.race([
      disconnected,
      new Promise<string>((resolve) => setTimeout(() => resolve('still connected'), 6000)),
    ]);
    expect(reason).toBe('io server disconnect');
  });
});

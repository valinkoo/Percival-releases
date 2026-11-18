import type {
  ChannelDto,
  ChannelRemovedEvent,
  ClientToServerEvents,
  MessageDto,
  RoleName,
  ServerToClientEvents,
  UserDto,
} from '@percival/shared';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  authHeader,
  createTestContext,
  createUser,
  oldTokenFor,
  tokenFor,
  type TestContext,
} from './helpers/app.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** What the access rules push to connected clients: who loses or gains channels, who is cut off. */
describe('realtime access changes', () => {
  let ctx: TestContext;
  let baseUrl: string;
  let generalId: string;
  const tokens = new Map<string, string>();
  const ids = new Map<string, string>();
  const sockets: ClientSocket[] = [];

  async function account(name: string, role: RoleName): Promise<void> {
    const user = await createUser(ctx.prisma, name, role);
    ids.set(name, user.id);
    tokens.set(name, tokenFor(ctx.app, user.id));
  }

  beforeAll(async () => {
    ctx = await createTestContext();
    await ctx.app.listen({ host: '127.0.0.1', port: 0 });
    const address = ctx.app.server.address();
    if (typeof address !== 'object' || address === null) throw new Error('no address');
    baseUrl = `http://127.0.0.1:${address.port}`;
    generalId = (await ctx.prisma.channel.findFirstOrThrow({ where: { name: 'general' } })).id;
    for (const [name, role] of [
      ['root', 'admin'],
      ['modo', 'moderator'],
      ['bob', 'member'],
      ['gus', 'guest'],
    ] as const) {
      await account(name, role);
    }
  });
  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.close();
  });
  afterAll(async () => ctx.close());

  const id = (name: string) => ids.get(name) as string;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition() && Date.now() < deadline) await sleep(20);
  }
  /** Leaves time for events that must NOT arrive to show up, if they were going to. */
  const settle = () => sleep(300);

  function connect(token: string): Promise<ClientSocket> {
    const socket: ClientSocket = io(baseUrl, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
    });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  function listen(socket: ClientSocket) {
    const created: ChannelDto[] = [];
    const updated: ChannelDto[] = [];
    const removed: ChannelRemovedEvent[] = [];
    const accountUpdates: UserDto[] = [];
    const messages: MessageDto[] = [];
    const closed: string[] = [];
    socket.on('channel_created', (channel) => created.push(channel));
    socket.on('channel_updated', (channel) => updated.push(channel));
    socket.on('channel_removed', (event) => removed.push(event));
    socket.on('account_updated', (user) => accountUpdates.push(user));
    socket.on('new_message', (message) => messages.push(message));
    socket.on('disconnect', (reason) => closed.push(reason));
    return { created, updated, removed, accountUpdates, messages, closed };
  }

  const call = (
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    as: string,
    payload?: unknown,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers: authHeader(tokens.get(as) as string),
      ...(payload !== undefined && { payload: payload as object }),
    });

  async function createChannel(as: string, payload: Record<string, unknown>): Promise<ChannelDto> {
    const response = await call('POST', '/api/channels', as, payload);
    expect(response.statusCode).toBe(201);
    return response.json<{ channel: ChannelDto }>().channel;
  }

  describe('handshake', () => {
    it('refuses a disabled account, saying so', async () => {
      await account('disabled', 'member');
      await ctx.prisma.user.update({
        where: { id: id('disabled') },
        data: { disabledAt: new Date() },
      });
      await expect(connect(tokens.get('disabled') as string)).rejects.toThrow('account_disabled');
    });

    it('refuses a token issued before the last password change or reset', async () => {
      await account('revoked', 'member');
      const stale = oldTokenFor(ctx.app, id('revoked'));
      await ctx.prisma.user.update({
        where: { id: id('revoked') },
        data: { sessionsRevokedBefore: new Date() },
      });
      await expect(connect(stale)).rejects.toThrow('unauthorized');
      // A token issued afterwards is fine.
      await settle();
      await ctx.prisma.user.update({
        where: { id: id('revoked') },
        data: { sessionsRevokedBefore: new Date(Date.now() - 5000) },
      });
      await expect(connect(tokenFor(ctx.app, id('revoked')))).resolves.toBeDefined();
    });

    it('refuses an account that still has a temporary password', async () => {
      await account('temporary', 'member');
      await ctx.prisma.user.update({
        where: { id: id('temporary') },
        data: { mustChangePassword: true },
      });
      await expect(connect(tokens.get('temporary') as string)).rejects.toThrow(
        'password_change_required',
      );
    });
  });

  describe('cutting connections', () => {
    it('drops the connections of an account an admin disables, and nobody else', async () => {
      await account('target', 'member');
      const target = listen(await connect(tokens.get('target') as string));
      const bystander = listen(await connect(tokens.get('bob') as string));

      const response = await call('PATCH', `/api/users/${id('target')}`, 'root', { active: false });
      expect(response.statusCode).toBe(200);
      await waitFor(() => target.closed.length > 0);
      expect(target.closed).toEqual(['io server disconnect']);
      await settle();
      expect(bystander.closed).toEqual([]);
    });

    it('drops the connections of an account whose password was reset', async () => {
      await account('forgetful', 'member');
      const socket = listen(await connect(oldTokenFor(ctx.app, id('forgetful'))));
      const response = await call('POST', `/api/users/${id('forgetful')}/password`, 'modo', {
        password: 'Temporary-Pass-0001',
      });
      expect(response.statusCode).toBe(200);
      await waitFor(() => socket.closed.length > 0);
      expect(socket.closed).toEqual(['io server disconnect']);
    });

    it('drops the other connections of an account that changes its own password', async () => {
      await account('changer', 'member');
      const otherDevice = listen(await connect(oldTokenFor(ctx.app, id('changer'))));
      const response = await call('POST', '/api/auth/password', 'changer', {
        currentPassword: 'Correct-Horse-Battery-1',
        newPassword: 'Another-Password-77',
      });
      expect(response.statusCode).toBe(200);
      await waitFor(() => otherDevice.closed.length > 0);
      expect(otherDevice.closed).toEqual(['io server disconnect']);
    });
  });

  describe('channels', () => {
    it('shows a new private channel to its creator and the admins only', async () => {
      const root = listen(await connect(tokens.get('root') as string));
      const modo = listen(await connect(tokens.get('modo') as string));
      const bob = listen(await connect(tokens.get('bob') as string));

      const channel = await createChannel('modo', { name: 'modo-private', isPrivate: true });
      await waitFor(() => root.created.length > 0 && modo.created.length > 0);
      await settle();
      expect(root.created.map((entry) => entry.id)).toEqual([channel.id]);
      expect(modo.created.map((entry) => entry.id)).toEqual([channel.id]);
      expect(bob.created).toEqual([]);

      // The creator really is subscribed: they receive what is posted there.
      await call('POST', `/api/channels/${channel.id}/messages`, 'root', { content: 'bonjour' });
      await waitFor(() => modo.messages.length > 0);
      expect(modo.messages.map((message) => message.content)).toEqual(['bonjour']);
      expect(bob.messages).toEqual([]);
    });

    it('tells the members of a channel that it was renamed, and nobody else', async () => {
      const channel = await createChannel('root', { name: 'old-name', isPrivate: true });
      await call('PUT', `/api/channels/${channel.id}/members/${id('bob')}`, 'root');
      const root = listen(await connect(tokens.get('root') as string));
      const bob = listen(await connect(tokens.get('bob') as string));
      const modo = listen(await connect(tokens.get('modo') as string));

      const response = await call('PATCH', `/api/channels/${channel.id}`, 'modo', { name: 'x' });
      expect(response.statusCode).toBe(404); // The moderator cannot see it, so cannot rename it.
      const renamed = await call('PATCH', `/api/channels/${channel.id}`, 'root', {
        name: 'new-name',
      });
      expect(renamed.statusCode).toBe(200);
      await waitFor(() => root.updated.length > 0 && bob.updated.length > 0);
      await settle();
      expect(bob.updated.map((entry) => entry.name)).toEqual(['new-name']);
      expect(root.updated.map((entry) => entry.name)).toEqual(['new-name']);
      expect(modo.updated).toEqual([]);
    });

    it('subscribes a member added to a private channel, and unsubscribes them on removal', async () => {
      const channel = await createChannel('root', { name: 'toggle', isPrivate: true });
      const bob = listen(await connect(tokens.get('bob') as string));

      await call('PUT', `/api/channels/${channel.id}/members/${id('bob')}`, 'root');
      await waitFor(() => bob.created.length > 0);
      expect(bob.created.map((entry) => entry.id)).toEqual([channel.id]);
      await call('POST', `/api/channels/${channel.id}/messages`, 'root', { content: 'bienvenue' });
      await waitFor(() => bob.messages.length > 0);
      expect(bob.messages.map((message) => message.content)).toEqual(['bienvenue']);

      await call('DELETE', `/api/channels/${channel.id}/members/${id('bob')}`, 'root');
      await waitFor(() => bob.removed.length > 0);
      expect(bob.removed).toEqual([{ id: channel.id }]);
      await call('POST', `/api/channels/${channel.id}/messages`, 'root', { content: 'secret' });
      await settle();
      expect(bob.messages.map((message) => message.content)).toEqual(['bienvenue']);
    });

    it('gives a guest a channel when assigned to it, and takes it back when removed', async () => {
      const channel = await createChannel('root', { name: 'for-the-guest' });
      const gus = listen(await connect(tokens.get('gus') as string));

      await call('PUT', `/api/channels/${channel.id}/members/${id('gus')}`, 'modo');
      await waitFor(() => gus.created.length > 0);
      expect(gus.created.map((entry) => entry.id)).toEqual([channel.id]);

      await call('DELETE', `/api/channels/${channel.id}/members/${id('gus')}`, 'modo');
      await waitFor(() => gus.removed.length > 0);
      expect(gus.removed).toEqual([{ id: channel.id }]);
    });
  });

  describe('role changes', () => {
    it('tells the person their new role and moves them to the channels it allows', async () => {
      await account('climber', 'guest');
      const socket = listen(await connect(tokens.get('climber') as string));

      const up = await call('PATCH', `/api/users/${id('climber')}`, 'root', { role: 'member' });
      expect(up.statusCode).toBe(200);
      await waitFor(() => socket.accountUpdates.length > 0 && socket.created.length > 0);
      expect(socket.accountUpdates[0]?.roles).toEqual(['member']);
      // A member sees the public channels a guest does not.
      expect(socket.created.map((entry) => entry.id)).toContain(generalId);

      const down = await call('PATCH', `/api/users/${id('climber')}`, 'root', { role: 'guest' });
      expect(down.statusCode).toBe(200);
      await waitFor(() => socket.removed.some((entry) => entry.id === generalId));
      expect(socket.accountUpdates.at(-1)?.roles).toEqual(['guest']);

      // Back to the lowest role: they no longer get what is posted in general.
      await call('POST', `/api/channels/${generalId}/messages`, 'root', { content: 'public' });
      await settle();
      expect(socket.messages).toEqual([]);
    });
  });
});

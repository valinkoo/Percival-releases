import type {
  ApiErrorBody,
  ChannelDto,
  ChannelMembersResponse,
  ChannelsResponse,
  CreateChannelResponse,
  RoleName,
  UpdateChannelResponse,
} from '@percival/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authHeader,
  createTestContext,
  createUser,
  tokenFor,
  type TestContext,
} from './helpers/app.js';

describe('channel administration', () => {
  let ctx: TestContext;
  const tokens = new Map<string, string>();
  const ids = new Map<string, string>();

  async function account(name: string, role: RoleName): Promise<void> {
    const user = await createUser(ctx.prisma, name, role);
    ids.set(name, user.id);
    tokens.set(name, tokenFor(ctx.app, user.id));
  }

  beforeAll(async () => {
    ctx = await createTestContext();
    for (const [name, role] of [
      ['root', 'admin'],
      ['modo', 'moderator'],
      ['modo2', 'moderator'],
      ['bob', 'member'],
      ['carol', 'member'],
      ['gus', 'guest'],
      ['gus2', 'guest'],
      ['robot', 'bot'],
    ] as const) {
      await account(name, role);
    }
  });
  afterAll(async () => ctx.close());

  const id = (name: string) => ids.get(name) as string;
  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    as: string | null,
    payload?: unknown,
  ) =>
    ctx.app.inject({
      method,
      url,
      headers: as ? authHeader(tokens.get(as) as string) : {},
      ...(payload !== undefined && { payload: payload as object }),
    });
  const code = (response: { json: <T>() => T }) => response.json<ApiErrorBody>().error.code;

  const visibleTo = async (as: string) =>
    (await call('GET', '/api/channels', as))
      .json<ChannelsResponse>()
      .channels.map((channel) => channel.name)
      .sort();

  async function createChannel(as: string, payload: Record<string, unknown>): Promise<ChannelDto> {
    const response = await call('POST', '/api/channels', as, payload);
    expect(response.statusCode).toBe(201);
    return response.json<CreateChannelResponse>().channel;
  }

  describe('creating a channel', () => {
    it('lets an admin and a moderator create one, and nobody else', async () => {
      expect((await createChannel('root', { name: 'by-root' })).isPrivate).toBe(false);
      expect((await createChannel('modo', { name: 'by-modo' })).isPrivate).toBe(false);
      for (const as of ['bob', 'gus']) {
        const response = await call('POST', '/api/channels', as, { name: `by-${as}` });
        expect(response.statusCode).toBe(403);
        expect(code(response)).toBe('forbidden');
      }
      expect((await call('POST', '/api/channels', null, { name: 'anon' })).statusCode).toBe(401);
      expect(
        await ctx.prisma.channel.count({ where: { name: { in: ['by-bob', 'by-gus'] } } }),
      ).toBe(0);
    });

    it('makes the creator a member of a private channel, so they can see it', async () => {
      const channel = await createChannel('modo', { name: 'modo-room', isPrivate: true });
      expect(channel.isPrivate).toBe(true);
      const members = await ctx.prisma.channelMember.findMany({ where: { channelId: channel.id } });
      expect(members.map((member) => member.userId)).toEqual([id('modo')]);

      expect(await visibleTo('modo')).toContain('modo-room');
      expect(await visibleTo('root')).toContain('modo-room');
      for (const as of ['modo2', 'bob', 'gus']) {
        expect(await visibleTo(as)).not.toContain('modo-room');
      }
    });

    it('lets a channel be created private only at creation, with no side effect when public', async () => {
      const publicChannel = await createChannel('root', { name: 'open-room', isPrivate: false });
      expect(await ctx.prisma.channelMember.count({ where: { channelId: publicChannel.id } })).toBe(
        0,
      );
    });
  });

  describe('renaming a channel', () => {
    const rename = (as: string | null, channelId: string, payload: unknown) =>
      call('PATCH', `/api/channels/${channelId}`, as, payload);

    it('lets an admin and a moderator rename a channel and change its description', async () => {
      const channel = await createChannel('root', { name: 'before' });
      const byModo = await rename('modo', channel.id, { name: ' After Modo ' });
      expect(byModo.statusCode).toBe(200);
      expect(byModo.json<UpdateChannelResponse>().channel.name).toBe('after-modo');

      const byRoot = await rename('root', channel.id, { description: 'Nouvelle description' });
      const updated = byRoot.json<UpdateChannelResponse>().channel;
      expect(updated).toMatchObject({ name: 'after-modo', description: 'Nouvelle description' });
    });

    it('refuses members, guests and anonymous callers', async () => {
      const channel = await createChannel('root', { name: 'guarded' });
      expect((await rename('bob', channel.id, { name: 'hacked' })).statusCode).toBe(403);
      expect((await rename('gus', channel.id, { name: 'hacked' })).statusCode).toBe(403);
      expect((await rename(null, channel.id, { name: 'hacked' })).statusCode).toBe(401);
      const stored = await ctx.prisma.channel.findUniqueOrThrow({ where: { id: channel.id } });
      expect(stored.name).toBe('guarded');
    });

    it('refuses a name already taken and malformed requests', async () => {
      const channel = await createChannel('root', { name: 'unique-one' });
      await createChannel('root', { name: 'unique-two' });
      const taken = await rename('root', channel.id, { name: 'unique-two' });
      expect(taken.statusCode).toBe(409);
      expect(code(taken)).toBe('conflict');
      expect((await rename('root', channel.id, {})).statusCode).toBe(400);
      expect((await rename('root', channel.id, { name: '!!!' })).statusCode).toBe(400);
      expect((await rename('root', 'not-a-uuid', { name: 'x-y-z' })).statusCode).toBe(400);
    });

    it('is a 404 for a channel the caller cannot see, or that does not exist', async () => {
      const hidden = await createChannel('root', { name: 'admins-only', isPrivate: true });
      expect((await rename('modo', hidden.id, { name: 'seen' })).statusCode).toBe(404);
      expect((await rename('root', crypto.randomUUID(), { name: 'nobody' })).statusCode).toBe(404);
    });

    it('never changes whether a channel is private', async () => {
      const channel = await createChannel('root', { name: 'stays-private', isPrivate: true });
      const response = await rename('root', channel.id, {
        name: 'still-private',
        isPrivate: false,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<UpdateChannelResponse>().channel.isPrivate).toBe(true);
      expect((await rename('root', channel.id, { isPrivate: false })).statusCode).toBe(400);
    });
  });

  describe('members', () => {
    const members = (as: string | null, channelId: string) =>
      call('GET', `/api/channels/${channelId}/members`, as);
    const add = (as: string | null, channelId: string, target: string) =>
      call('PUT', `/api/channels/${channelId}/members/${target}`, as);
    const remove = (as: string | null, channelId: string, target: string) =>
      call('DELETE', `/api/channels/${channelId}/members/${target}`, as);
    const names = (list: { username: string }[]) => list.map((entry) => entry.username).sort();

    it('refuses members, guests and anonymous callers', async () => {
      const channel = await createChannel('root', { name: 'who-can-manage' });
      for (const as of ['bob', 'gus']) {
        expect((await members(as, channel.id)).statusCode).toBe(403);
        expect((await add(as, channel.id, id('carol'))).statusCode).toBe(403);
        expect((await remove(as, channel.id, id('carol'))).statusCode).toBe(403);
      }
      expect((await members(null, channel.id)).statusCode).toBe(401);
      expect(await ctx.prisma.channelMember.count({ where: { channelId: channel.id } })).toBe(0);
    });

    it('lists the members and who can be added to a private channel', async () => {
      const channel = await createChannel('root', { name: 'private-list', isPrivate: true });
      await add('root', channel.id, id('bob'));
      // A disabled account is never offered.
      await ctx.prisma.user.update({
        where: { id: id('carol') },
        data: { disabledAt: new Date() },
      });

      const response = await members('root', channel.id);
      expect(response.statusCode).toBe(200);
      const body = response.json<ChannelMembersResponse>();
      expect(names(body.members)).toEqual(['bob', 'root']);
      // No admin (they see everything), no bot, no disabled account, nobody already in.
      expect(names(body.candidates)).toEqual(['gus', 'gus2', 'modo', 'modo2']);
      expect(body.members.find((member) => member.username === 'bob')?.role).toBe('member');

      await ctx.prisma.user.update({ where: { id: id('carol') }, data: { disabledAt: null } });
    });

    it('offers only guests for a public channel, since the others see it anyway', async () => {
      const channel = await createChannel('root', { name: 'public-list' });
      const body = (await members('root', channel.id)).json<ChannelMembersResponse>();
      expect(body.members).toEqual([]);
      expect(names(body.candidates)).toEqual(['gus', 'gus2']);
    });

    it('lets a moderator manage the channels they can see, and only those', async () => {
      const mine = await createChannel('modo', { name: 'modo-managed', isPrivate: true });
      expect((await add('modo', mine.id, id('bob'))).statusCode).toBe(200);
      expect(
        names((await members('modo', mine.id)).json<ChannelMembersResponse>().members),
      ).toEqual(['bob', 'modo']);

      const hidden = await createChannel('root', { name: 'hidden-from-modo', isPrivate: true });
      expect((await members('modo', hidden.id)).statusCode).toBe(404);
      expect((await add('modo', hidden.id, id('modo'))).statusCode).toBe(404);
      expect((await remove('modo', hidden.id, id('root'))).statusCode).toBe(404);
      expect(await ctx.prisma.channelMember.count({ where: { channelId: hidden.id } })).toBe(1);
    });

    it('gives access with an addition and takes it away with a removal', async () => {
      const channel = await createChannel('root', { name: 'on-and-off', isPrivate: true });
      expect(await visibleTo('bob')).not.toContain('on-and-off');
      const messages = (as: string) => call('GET', `/api/channels/${channel.id}/messages`, as);
      expect((await messages('bob')).statusCode).toBe(404);

      expect((await add('root', channel.id, id('bob'))).statusCode).toBe(200);
      expect(await visibleTo('bob')).toContain('on-and-off');
      expect((await messages('bob')).statusCode).toBe(200);

      const gone = await remove('root', channel.id, id('bob'));
      expect(gone.statusCode).toBe(200);
      expect(names(gone.json<ChannelMembersResponse>().members)).toEqual(['root']);
      expect(await visibleTo('bob')).not.toContain('on-and-off');
      expect((await messages('bob')).statusCode).toBe(404);
    });

    it('treats a repeated addition or removal as a no-op', async () => {
      const channel = await createChannel('root', { name: 'idempotent', isPrivate: true });
      await add('root', channel.id, id('bob'));
      expect((await add('root', channel.id, id('bob'))).statusCode).toBe(200);
      expect(
        await ctx.prisma.channelMember.count({
          where: { channelId: channel.id, userId: id('bob') },
        }),
      ).toBe(1);
      await remove('root', channel.id, id('bob'));
      expect((await remove('root', channel.id, id('bob'))).statusCode).toBe(200);
    });

    it('lets a moderator remove themselves, and then they lose sight of the channel', async () => {
      const channel = await createChannel('modo', { name: 'leaving', isPrivate: true });
      const response = await remove('modo', channel.id, id('modo'));
      expect(response.statusCode).toBe(200);
      expect(await visibleTo('modo')).not.toContain('leaving');
      expect((await members('modo', channel.id)).statusCode).toBe(404);
    });

    it('rejects unknown, disabled and bot accounts and malformed identifiers', async () => {
      const channel = await createChannel('root', { name: 'strict-add', isPrivate: true });
      expect((await add('root', channel.id, crypto.randomUUID())).statusCode).toBe(404);
      expect((await add('root', channel.id, id('robot'))).statusCode).toBe(404);
      await ctx.prisma.user.update({ where: { id: id('gus2') }, data: { disabledAt: new Date() } });
      expect((await add('root', channel.id, id('gus2'))).statusCode).toBe(404);
      await ctx.prisma.user.update({ where: { id: id('gus2') }, data: { disabledAt: null } });
      expect((await add('root', channel.id, 'not-a-uuid')).statusCode).toBe(400);
      expect((await members('root', 'not-a-uuid')).statusCode).toBe(400);
    });
  });

  describe('guests', () => {
    let clientA: ChannelDto;
    let clientB: ChannelDto;

    beforeAll(async () => {
      clientA = await createChannel('root', { name: 'client-a' });
      clientB = await createChannel('root', { name: 'client-b' });
      await call('PUT', `/api/channels/${clientA.id}/members/${id('gus')}`, 'root');
      await call('PUT', `/api/channels/${clientB.id}/members/${id('gus2')}`, 'root');
    });

    it('see only the channels they were assigned to', async () => {
      expect(await visibleTo('gus')).toEqual(['client-a']);
      expect(await visibleTo('gus2')).toEqual(['client-b']);
    });

    it('cannot read, write or learn about the channels of someone else', async () => {
      const channelId = clientB.id;
      const read = await call('GET', `/api/channels/${channelId}/messages`, 'gus');
      expect(read.statusCode).toBe(404);
      const write = await call('POST', `/api/channels/${channelId}/messages`, 'gus', {
        content: 'intrus',
      });
      expect(write.statusCode).toBe(404);
      const markRead = await call('POST', `/api/channels/${channelId}/read`, 'gus', {
        messageId: crypto.randomUUID(),
      });
      expect(markRead.statusCode).toBe(404);
      expect(await ctx.prisma.message.count({ where: { channelId } })).toBe(0);
    });

    it('cannot see the general channel, public as it is', async () => {
      const general = await ctx.prisma.channel.findFirstOrThrow({ where: { name: 'general' } });
      const response = await call('GET', `/api/channels/${general.id}/messages`, 'gus');
      expect(response.statusCode).toBe(404);
    });

    it('cannot administer anything', async () => {
      expect((await call('GET', '/api/users', 'gus')).statusCode).toBe(403);
      expect((await call('POST', '/api/channels', 'gus', { name: 'guest-room' })).statusCode).toBe(
        403,
      );
      const members = await call('GET', `/api/channels/${clientA.id}/members`, 'gus');
      expect(members.statusCode).toBe(403);
    });
  });
});

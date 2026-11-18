import type {
  ApiErrorBody,
  MessageDto,
  MessagesPageResponse,
  RoleName,
  SendMessageResponse,
} from '@percival/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authHeader,
  createTestContext,
  createUser,
  tokenFor,
  type TestContext,
} from './helpers/app.js';

describe('message moderation', () => {
  let ctx: TestContext;
  let generalId: string;
  const tokens = new Map<string, string>();

  async function account(name: string, role: RoleName): Promise<void> {
    const user = await createUser(ctx.prisma, name, role);
    tokens.set(name, tokenFor(ctx.app, user.id));
  }

  beforeAll(async () => {
    ctx = await createTestContext();
    generalId = (await ctx.prisma.channel.findFirstOrThrow({ where: { name: 'general' } })).id;
    for (const [name, role] of [
      ['root', 'admin'],
      ['root2', 'admin'],
      ['modo', 'moderator'],
      ['modo2', 'moderator'],
      ['bob', 'member'],
      ['carol', 'member'],
      ['robot', 'bot'],
    ] as const) {
      await account(name, role);
    }
    // A guest assigned to the channel: guests write there too.
    await account('gus', 'guest');
    const gus = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'gus' } });
    await ctx.prisma.channelMember.create({ data: { channelId: generalId, userId: gus.id } });
  });
  afterAll(async () => ctx.close());

  const token = (name: string) => tokens.get(name) as string;

  async function post(as: string, content: string): Promise<MessageDto> {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${generalId}/messages`,
      headers: authHeader(token(as)),
      payload: { content },
    });
    expect(response.statusCode).toBe(201);
    return response.json<SendMessageResponse>().message;
  }

  const remove = (as: string, message: MessageDto) =>
    ctx.app.inject({
      method: 'DELETE',
      url: `/api/channels/${generalId}/messages/${message.id}`,
      headers: authHeader(token(as)),
    });

  const isListed = async (message: MessageDto) => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/api/channels/${generalId}/messages`,
      headers: authHeader(token('root')),
    });
    return response
      .json<MessagesPageResponse>()
      .messages.some((candidate) => candidate.id === message.id);
  };

  it('tells each message its author role, so a client knows whom a moderator outranks', async () => {
    expect((await post('bob', 'salut')).author.role).toBe('member');
    expect((await post('modo', 'salut')).author.role).toBe('moderator');
    expect((await post('root', 'salut')).author.role).toBe('admin');
    expect((await post('gus', 'salut')).author.role).toBe('guest');
  });

  it.each([
    ['modo', 'bob', 'a member'],
    ['modo', 'gus', 'a guest'],
    ['root', 'bob', 'a member'],
    ['root', 'modo', 'a moderator'],
    ['root', 'gus', 'a guest'],
  ])('lets %s delete the message of %s (%s)', async (as, author) => {
    const message = await post(author, 'à modérer');
    const response = await remove(as, message);
    expect(response.statusCode).toBe(200);
    expect(await isListed(message)).toBe(false);
    // Soft delete: the row stays for the archive.
    const stored = await ctx.prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(stored.deletedAt).not.toBeNull();
  });

  it.each([
    ['modo', 'modo2'],
    ['modo', 'root'],
    ['root', 'root2'],
    ['bob', 'carol'],
    ['bob', 'gus'],
    ['gus', 'bob'],
  ])('refuses %s deleting the message of %s: no right, or not a lower rank', async (as, author) => {
    const message = await post(author, 'intouchable');
    const response = await remove(as, message);
    expect(response.statusCode).toBe(403);
    expect(response.json<ApiErrorBody>().error.code).toBe('forbidden');
    expect(await isListed(message)).toBe(true);
  });

  it('lets anyone delete their own message, an admin included', async () => {
    for (const author of ['root', 'modo', 'bob', 'gus']) {
      const message = await post(author, 'le mien');
      expect((await remove(author, message)).statusCode).toBe(200);
    }
  });

  it("lets moderators and admins delete a bot's messages, and nobody else", async () => {
    // A bot has no API to post with yet: its message is written straight into the database.
    const robot = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'robot' } });
    const row = await ctx.prisma.message.create({
      data: { channelId: generalId, userId: robot.id, content: 'bip' },
    });
    const message = { id: row.id } as MessageDto;
    expect((await remove('bob', message)).statusCode).toBe(403);
    expect((await remove('modo', message)).statusCode).toBe(200);
  });

  it('never lets a moderator or an admin edit what someone else wrote', async () => {
    const message = await post('bob', 'mes mots');
    for (const as of ['modo', 'root']) {
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/channels/${generalId}/messages/${message.id}`,
        headers: authHeader(token(as)),
        payload: { content: 'falsifié' },
      });
      expect(response.statusCode).toBe(403);
    }
    const stored = await ctx.prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    expect(stored.content).toBe('mes mots');
  });

  it('stays a 404 for a moderator who cannot see the channel', async () => {
    const secret = await ctx.prisma.channel.create({ data: { name: 'secret', isPrivate: true } });
    const bob = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'bob' } });
    await ctx.prisma.channelMember.create({ data: { channelId: secret.id, userId: bob.id } });
    const row = await ctx.prisma.message.create({
      data: { channelId: secret.id, userId: bob.id, content: 'privé' },
    });
    const response = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/channels/${secret.id}/messages/${row.id}`,
      headers: authHeader(token('modo')),
    });
    expect(response.statusCode).toBe(404);
  });
});

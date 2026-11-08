import type {
  ApiErrorBody,
  MessageDto,
  MessagesPageResponse,
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

describe('messages', () => {
  let ctx: TestContext;
  let generalId: string;
  let privateId: string;
  let alice: { id: string; token: string };
  let bob: { id: string; token: string };
  let guest: { id: string; token: string };

  beforeAll(async () => {
    ctx = await createTestContext();
    const a = await createUser(ctx.prisma, 'alice', 'admin');
    const b = await createUser(ctx.prisma, 'bob', 'member');
    const g = await createUser(ctx.prisma, 'guest', 'guest');
    alice = { id: a.id, token: tokenFor(ctx.app, a.id) };
    bob = { id: b.id, token: tokenFor(ctx.app, b.id) };
    guest = { id: g.id, token: tokenFor(ctx.app, g.id) };

    generalId = (await ctx.prisma.channel.findFirstOrThrow({ where: { name: 'general' } })).id;
    privateId = (await ctx.prisma.channel.create({ data: { name: 'secret', isPrivate: true } })).id;
  });
  afterAll(async () => ctx.close());

  const send = (token: string, channelId: string, payload: unknown) =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${channelId}/messages`,
      headers: authHeader(token),
      payload: payload as object,
    });

  const history = (token: string, channelId: string, query = '') =>
    ctx.app.inject({
      method: 'GET',
      url: `/api/channels/${channelId}/messages${query}`,
      headers: authHeader(token),
    });

  describe('sending', () => {
    it('stores a message and returns it with its author', async () => {
      const response = await send(bob.token, generalId, { content: 'Bonjour **tout le monde**' });
      expect(response.statusCode).toBe(201);
      const { message } = response.json<SendMessageResponse>();
      expect(message).toMatchObject({
        channelId: generalId,
        content: 'Bonjour **tout le monde**',
        author: { id: bob.id, username: 'bob', isBot: false },
      });
      const stored = await ctx.prisma.message.findUniqueOrThrow({ where: { id: message.id } });
      expect(stored.userId).toBe(bob.id);
      expect(stored.deletedAt).toBeNull();
    });

    it('drops trailing whitespace but keeps leading indentation', async () => {
      const response = await send(bob.token, generalId, { content: '    code\n\n  ' });
      expect(response.json<SendMessageResponse>().message.content).toBe('    code');
    });

    it('refuses empty, blank, oversized and malformed content', async () => {
      for (const payload of [
        {},
        { content: '' },
        { content: ' \n\t ' },
        { content: 42 },
        { content: 'x'.repeat(4001) },
      ]) {
        const response = await send(bob.token, generalId, payload);
        expect(response.statusCode, JSON.stringify(payload).slice(0, 40)).toBe(400);
      }
      const maxLength = await send(bob.token, generalId, { content: 'x'.repeat(4000) });
      expect(maxLength.statusCode).toBe(201);
    });

    it('requires authentication', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: `/api/channels/${generalId}/messages`,
        payload: { content: 'hello' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('answers 404 for unknown channels and for channels the user cannot see', async () => {
      const unknown = await send(bob.token, '0198c0de-0000-7000-8000-000000000000', {
        content: 'x',
      });
      expect(unknown.statusCode).toBe(404);

      // Private channel without membership, and a public channel for a guest without assignment.
      for (const [token, channelId] of [
        [bob.token, privateId],
        [guest.token, generalId],
      ] as const) {
        const response = await send(token, channelId, { content: 'let me in' });
        expect(response.statusCode).toBe(404);
        expect(response.json<ApiErrorBody>().error.code).toBe('not_found');
      }
      expect(await ctx.prisma.message.count({ where: { content: 'let me in' } })).toBe(0);
    });

    it('rejects a channel id that is not a UUID', async () => {
      const response = await send(bob.token, 'not-a-uuid', { content: 'x' });
      expect(response.statusCode).toBe(400);
    });

    it('lets an administrator write in a private channel', async () => {
      const response = await send(alice.token, privateId, { content: 'confidentiel' });
      expect(response.statusCode).toBe(201);
    });
  });

  describe('history', () => {
    const TOTAL = 120;
    let channelId: string;

    beforeAll(async () => {
      channelId = (await ctx.prisma.channel.create({ data: { name: 'history' } })).id;
      const start = Date.now() - TOTAL * 1000;
      await ctx.prisma.message.createMany({
        data: Array.from({ length: TOTAL }, (_, index) => ({
          channelId,
          userId: alice.id,
          content: `message ${index}`,
          createdAt: new Date(start + index * 1000),
        })),
      });
    });

    it('returns the latest messages first page, oldest first', async () => {
      const response = await history(bob.token, channelId);
      expect(response.statusCode).toBe(200);
      const page = response.json<MessagesPageResponse>();
      expect(page.messages).toHaveLength(50);
      expect(page.messages[0]?.content).toBe('message 70');
      expect(page.messages[49]?.content).toBe('message 119');
      expect(page.nextBefore).toBe(page.messages[0]?.id);
    });

    it('walks the whole history without gaps or duplicates', async () => {
      const collected: MessageDto[] = [];
      let before: string | null = null;
      let pages = 0;
      do {
        const query: string = before ? `?limit=45&before=${before}` : '?limit=45';
        const response = await history(bob.token, channelId, query);
        const page: MessagesPageResponse = response.json<MessagesPageResponse>();
        collected.unshift(...page.messages);
        before = page.nextBefore;
        pages++;
      } while (before && pages < 10);

      expect(pages).toBe(3);
      expect(collected.map((message) => message.content)).toEqual(
        Array.from({ length: TOTAL }, (_, index) => `message ${index}`),
      );
    });

    it('paginates correctly when many messages share the same timestamp', async () => {
      const sameInstant = (await ctx.prisma.channel.create({ data: { name: 'same-instant' } })).id;
      const at = new Date('2026-01-01T10:00:00.000Z');
      await ctx.prisma.message.createMany({
        data: Array.from({ length: 25 }, (_, index) => ({
          channelId: sameInstant,
          userId: alice.id,
          content: `tie ${index}`,
          createdAt: at,
        })),
      });
      const seen = new Set<string>();
      let before: string | null = null;
      do {
        const response = await history(
          bob.token,
          sameInstant,
          `?limit=10${before ? `&before=${before}` : ''}`,
        );
        const page: MessagesPageResponse = response.json<MessagesPageResponse>();
        for (const message of page.messages) seen.add(message.id);
        before = page.nextBefore;
      } while (before);
      expect(seen.size).toBe(25);
    });

    it('stops with a null cursor at the beginning of the channel', async () => {
      const response = await history(bob.token, channelId, '?limit=100');
      expect(response.json<MessagesPageResponse>().nextBefore).not.toBeNull();
      const first = response.json<MessagesPageResponse>();
      const rest = await history(bob.token, channelId, `?limit=100&before=${first.nextBefore}`);
      const lastPage = rest.json<MessagesPageResponse>();
      expect(lastPage.messages).toHaveLength(20);
      expect(lastPage.nextBefore).toBeNull();
    });

    it('returns an empty page for an empty channel', async () => {
      const emptyId = (await ctx.prisma.channel.create({ data: { name: 'empty' } })).id;
      const page = (await history(bob.token, emptyId)).json<MessagesPageResponse>();
      expect(page).toEqual({ messages: [], nextBefore: null });
    });

    it('hides soft-deleted messages but keeps them as valid cursors', async () => {
      const target = await ctx.prisma.message.findFirstOrThrow({
        where: { channelId, content: 'message 119' },
      });
      await ctx.prisma.message.update({
        where: { id: target.id },
        data: { deletedAt: new Date() },
      });

      const page = (await history(bob.token, channelId, '?limit=5')).json<MessagesPageResponse>();
      expect(page.messages.map((message) => message.content)).toEqual([
        'message 114',
        'message 115',
        'message 116',
        'message 117',
        'message 118',
      ]);

      const afterCursor = await history(bob.token, channelId, `?before=${target.id}&limit=1`);
      expect(afterCursor.statusCode).toBe(200);
      expect(afterCursor.json<MessagesPageResponse>().messages[0]?.content).toBe('message 118');
    });

    it('rejects bad pagination parameters', async () => {
      for (const query of ['?limit=0', '?limit=101', '?limit=abc', '?before=nope']) {
        expect((await history(bob.token, channelId, query)).statusCode, query).toBe(400);
      }
    });

    it('rejects a cursor taken from another channel', async () => {
      const foreign = await ctx.prisma.message.findFirstOrThrow({
        where: { channelId: generalId },
      });
      const response = await history(bob.token, channelId, `?before=${foreign.id}`);
      expect(response.statusCode).toBe(400);
    });

    it('does not show history of channels the user cannot see', async () => {
      expect((await history(bob.token, privateId)).statusCode).toBe(404);
      expect((await history(guest.token, generalId)).statusCode).toBe(404);
      expect((await history(alice.token, privateId)).statusCode).toBe(200);
    });
  });
});

import type {
  ApiErrorBody,
  DeleteMessageResponse,
  EditMessageResponse,
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

describe('editing and deleting messages', () => {
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

  async function post(token: string, channelId: string, content: string) {
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${channelId}/messages`,
      headers: authHeader(token),
      payload: { content },
    });
    return response.json<SendMessageResponse>().message;
  }

  const edit = (token: string | null, channelId: string, messageId: string, payload: unknown) =>
    ctx.app.inject({
      method: 'PATCH',
      url: `/api/channels/${channelId}/messages/${messageId}`,
      headers: token ? authHeader(token) : {},
      payload: payload as object,
    });

  const remove = (token: string | null, channelId: string, messageId: string) =>
    ctx.app.inject({
      method: 'DELETE',
      url: `/api/channels/${channelId}/messages/${messageId}`,
      headers: token ? authHeader(token) : {},
    });

  const history = async (token: string, channelId: string) =>
    (
      await ctx.app.inject({
        method: 'GET',
        url: `/api/channels/${channelId}/messages`,
        headers: authHeader(token),
      })
    ).json<MessagesPageResponse>().messages;

  describe('editing', () => {
    it('lets the author rewrite a message and marks it as edited', async () => {
      const original = await post(bob.token, generalId, 'premiere version');
      expect(original.editedAt).toBeNull();

      const response = await edit(bob.token, generalId, original.id, {
        content: 'seconde **version**  ',
      });
      expect(response.statusCode).toBe(200);
      const { message } = response.json<EditMessageResponse>();
      expect(message).toMatchObject({
        id: original.id,
        content: 'seconde **version**', // trailing blank space is dropped, like when sending
        author: { username: 'bob' },
        createdAt: original.createdAt,
      });
      expect(message.editedAt).not.toBeNull();

      const stored = (await history(bob.token, generalId)).find(
        (entry) => entry.id === original.id,
      );
      expect(stored).toEqual(message);
    });

    it('leaves a message alone when the text did not change', async () => {
      const original = await post(bob.token, generalId, 'identique');
      const response = await edit(bob.token, generalId, original.id, { content: 'identique' });
      expect(response.statusCode).toBe(200);
      expect(response.json<EditMessageResponse>().message.editedAt).toBeNull();
    });

    it("refuses to edit someone else's message, administrators included", async () => {
      const original = await post(bob.token, generalId, 'a moi');
      for (const token of [alice.token]) {
        const response = await edit(token, generalId, original.id, { content: 'piraté' });
        expect(response.statusCode).toBe(403);
        expect(response.json<ApiErrorBody>().error.code).toBe('forbidden');
      }
      const stored = await ctx.prisma.message.findUniqueOrThrow({ where: { id: original.id } });
      expect(stored.content).toBe('a moi');
      expect(stored.editedAt).toBeNull();
    });

    it('applies the same rules on the text as when sending', async () => {
      const original = await post(bob.token, generalId, 'valide');
      for (const payload of [{}, { content: '' }, { content: '  \n' }, { content: 42 }]) {
        const response = await edit(bob.token, generalId, original.id, payload);
        expect(response.statusCode).toBe(400);
        expect(response.json<ApiErrorBody>().error.code).toBe('invalid_request');
      }
      const tooLong = await edit(bob.token, generalId, original.id, { content: 'x'.repeat(4001) });
      expect(tooLong.statusCode).toBe(400);
    });

    it('answers 404 for unknown messages and for channels the user cannot see', async () => {
      const inGeneral = await post(bob.token, generalId, 'dans general');
      const inPrivate = await post(alice.token, privateId, 'dans secret');
      const unknown = '019a0000-0000-7000-8000-000000000000';

      const cases = [
        edit(bob.token, generalId, unknown, { content: 'x' }),
        // The message exists, but not in that channel.
        edit(bob.token, privateId, inGeneral.id, { content: 'x' }),
        // Bob cannot see the private channel, even for a message he never wrote.
        edit(bob.token, privateId, inPrivate.id, { content: 'x' }),
        // Guests only see the channels they were assigned to.
        edit(guest.token, generalId, inGeneral.id, { content: 'x' }),
      ];
      for (const response of await Promise.all(cases)) {
        expect(response.statusCode).toBe(404);
      }
    });

    it('requires a valid token', async () => {
      const original = await post(bob.token, generalId, 'protégé');
      expect((await edit(null, generalId, original.id, { content: 'x' })).statusCode).toBe(401);
    });
  });

  describe('deleting', () => {
    it('hides the message from the history but keeps the row for the archive', async () => {
      const original = await post(bob.token, generalId, 'à supprimer');

      const response = await remove(bob.token, generalId, original.id);
      expect(response.statusCode).toBe(200);
      expect(response.json<DeleteMessageResponse>()).toEqual({
        id: original.id,
        channelId: generalId,
      });

      const ids = (await history(alice.token, generalId)).map((entry) => entry.id);
      expect(ids).not.toContain(original.id);
      const stored = await ctx.prisma.message.findUniqueOrThrow({ where: { id: original.id } });
      expect(stored.deletedAt).not.toBeNull();
      expect(stored.content).toBe('à supprimer');
    });

    it("refuses to delete someone else's message to anyone who cannot moderate", async () => {
      // Moderators and admins are covered by moderation.test.ts.
      const carol = await createUser(ctx.prisma, 'carol', 'member');
      const original = await post(bob.token, generalId, 'pas touche');
      const response = await remove(tokenFor(ctx.app, carol.id), generalId, original.id);
      expect(response.statusCode).toBe(403);
      expect(response.json<ApiErrorBody>().error.code).toBe('forbidden');
      const ids = (await history(bob.token, generalId)).map((entry) => entry.id);
      expect(ids).toContain(original.id);
    });

    it('treats an already deleted message as gone', async () => {
      const original = await post(bob.token, generalId, 'une seule fois');
      expect((await remove(bob.token, generalId, original.id)).statusCode).toBe(200);
      expect((await remove(bob.token, generalId, original.id)).statusCode).toBe(404);
      expect((await edit(bob.token, generalId, original.id, { content: 'x' })).statusCode).toBe(
        404,
      );
    });

    it('answers 404 for channels the user cannot see, and 401 without a token', async () => {
      const inPrivate = await post(alice.token, privateId, 'discret');
      expect((await remove(bob.token, privateId, inPrivate.id)).statusCode).toBe(404);
      expect((await remove(null, privateId, inPrivate.id)).statusCode).toBe(401);
    });
  });
});

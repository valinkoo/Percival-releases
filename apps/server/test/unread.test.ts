import type {
  ApiErrorBody,
  ChannelsResponse,
  MarkChannelReadResponse,
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

/** Timestamps have a millisecond resolution: keep consecutive steps apart. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

describe('unread messages', () => {
  let ctx: TestContext;
  let generalId: string;
  let privateId: string;
  let alice: { id: string; token: string };
  let bob: { id: string; token: string };

  beforeAll(async () => {
    ctx = await createTestContext();
    const a = await createUser(ctx.prisma, 'alice', 'admin');
    const b = await createUser(ctx.prisma, 'bob', 'member');
    alice = { id: a.id, token: tokenFor(ctx.app, a.id) };
    bob = { id: b.id, token: tokenFor(ctx.app, b.id) };
    generalId = (await ctx.prisma.channel.findFirstOrThrow({ where: { name: 'general' } })).id;
    privateId = (await ctx.prisma.channel.create({ data: { name: 'secret', isPrivate: true } })).id;
    await tick();
  });
  afterAll(async () => ctx.close());

  async function post(token: string, channelId: string, content: string) {
    await tick();
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${channelId}/messages`,
      headers: authHeader(token),
      payload: { content },
    });
    return response.json<SendMessageResponse>().message;
  }

  const unreadOf = async (token: string) =>
    (
      await ctx.app.inject({ method: 'GET', url: '/api/channels', headers: authHeader(token) })
    ).json<ChannelsResponse>().unread;

  const markRead = (token: string, channelId: string, messageId: string) =>
    ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${channelId}/read`,
      headers: authHeader(token),
      payload: { messageId },
    });

  it('counts messages of others, never your own, and never deleted ones', async () => {
    expect(await unreadOf(alice.token)).toEqual({});

    await post(bob.token, generalId, 'un');
    const second = await post(bob.token, generalId, 'deux');
    await post(alice.token, generalId, 'ma réponse'); // own message
    expect(await unreadOf(alice.token)).toEqual({ [generalId]: 2 });
    // Bob sees Alice's message as unread, and none of his own.
    expect(await unreadOf(bob.token)).toEqual({ [generalId]: 1 });

    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/channels/${generalId}/messages/${second.id}`,
      headers: authHeader(bob.token),
    });
    expect(await unreadOf(alice.token)).toEqual({ [generalId]: 1 });
  });

  it('only lists channels the user can see', async () => {
    await post(alice.token, privateId, 'réservé aux administrateurs');
    expect(await unreadOf(bob.token)).not.toHaveProperty(privateId);
    expect(await unreadOf(alice.token)).not.toHaveProperty(privateId); // her own message
  });

  it('clears the counter once the channel is marked as read, and counts what comes next', async () => {
    const last = await post(bob.token, generalId, 'dernier message');
    expect((await unreadOf(alice.token))[generalId]).toBeGreaterThan(0);

    const response = await markRead(alice.token, generalId, last.id);
    expect(response.statusCode).toBe(200);
    expect(response.json<MarkChannelReadResponse>()).toMatchObject({ channelId: generalId });
    expect(await unreadOf(alice.token)).toEqual({});

    await post(bob.token, generalId, 'et après');
    expect(await unreadOf(alice.token)).toEqual({ [generalId]: 1 });
  });

  it('never moves the read marker backwards', async () => {
    const older = await post(bob.token, generalId, 'ancien');
    const newer = await post(bob.token, generalId, 'récent');

    const forward = await markRead(alice.token, generalId, newer.id);
    const backward = await markRead(alice.token, generalId, older.id);
    expect(backward.statusCode).toBe(200);
    expect(backward.json<MarkChannelReadResponse>().lastReadAt).toBe(
      forward.json<MarkChannelReadResponse>().lastReadAt,
    );
    expect(await unreadOf(alice.token)).toEqual({});
  });

  it('accepts a message deleted since it was read as a position', async () => {
    const message = await post(bob.token, generalId, 'vu puis supprimé');
    await ctx.app.inject({
      method: 'DELETE',
      url: `/api/channels/${generalId}/messages/${message.id}`,
      headers: authHeader(bob.token),
    });
    expect((await markRead(alice.token, generalId, message.id)).statusCode).toBe(200);
  });

  it('refuses unknown messages, invisible channels and malformed bodies', async () => {
    const known = await post(alice.token, generalId, 'existe');
    const hidden = await post(alice.token, privateId, 'caché');
    const unknown = '019a0000-0000-7000-8000-000000000000';

    expect((await markRead(alice.token, generalId, unknown)).statusCode).toBe(404);
    // A message of another channel is not a valid position.
    expect((await markRead(alice.token, generalId, hidden.id)).statusCode).toBe(404);
    // Bob cannot see the private channel.
    expect((await markRead(bob.token, privateId, hidden.id)).statusCode).toBe(404);

    const malformed = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${generalId}/read`,
      headers: authHeader(alice.token),
      payload: { messageId: 'not-a-uuid' },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json<ApiErrorBody>().error.code).toBe('invalid_request');

    const anonymous = await ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${generalId}/read`,
      payload: { messageId: known.id },
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('starts a new channel, and a new account, from their own creation', async () => {
    // A channel created after the user's account: everything posted in it is unread.
    const fresh = await ctx.prisma.channel.create({ data: { name: 'nouveau' } });
    await post(alice.token, fresh.id, 'bienvenue');
    await post(alice.token, fresh.id, 'deuxième');
    expect((await unreadOf(bob.token))[fresh.id]).toBe(2);

    // A later account does not open on the history that predates it.
    await tick();
    const carol = await createUser(ctx.prisma, 'carol', 'member');
    await tick();
    const carolToken = tokenFor(ctx.app, carol.id);
    expect(await unreadOf(carolToken)).toEqual({});
    await post(alice.token, generalId, 'pour carol');
    expect(await unreadOf(carolToken)).toEqual({ [generalId]: 1 });
  });
});

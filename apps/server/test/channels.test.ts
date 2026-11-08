import type { ApiErrorBody, ChannelsResponse, CreateChannelResponse } from '@percival/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authHeader,
  createTestContext,
  createUser,
  tokenFor,
  type TestContext,
} from './helpers/app.js';

describe('channels', () => {
  let ctx: TestContext;
  let admin: { token: string };
  let member: { token: string; id: string };
  let guest: { token: string; id: string };
  let privateChannelId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const a = await createUser(ctx.prisma, 'admin', 'admin');
    const m = await createUser(ctx.prisma, 'member', 'member');
    const g = await createUser(ctx.prisma, 'guest', 'guest');
    admin = { token: tokenFor(ctx.app, a.id) };
    member = { token: tokenFor(ctx.app, m.id), id: m.id };
    guest = { token: tokenFor(ctx.app, g.id), id: g.id };

    const privateChannel = await ctx.prisma.channel.create({
      data: { name: 'secret', isPrivate: true },
    });
    privateChannelId = privateChannel.id;
    // A public channel the guest was explicitly invited to, and a private one the member is in.
    const assigned = await ctx.prisma.channel.create({ data: { name: 'client-acme' } });
    await ctx.prisma.channelMember.createMany({
      data: [
        { channelId: assigned.id, userId: g.id },
        { channelId: privateChannel.id, userId: m.id },
      ],
    });
  });
  afterAll(async () => ctx.close());

  /** Channel names visible to a token, sorted so the checks do not depend on creation order. */
  const visibleTo = async (token: string) => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/channels',
      headers: authHeader(token),
    });
    expect(response.statusCode).toBe(200);
    return response
      .json<ChannelsResponse>()
      .channels.map((channel) => channel.name)
      .sort();
  };

  it('requires authentication', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/channels' });
    expect(response.statusCode).toBe(401);
  });

  it('shows administrators every channel, private ones included', async () => {
    expect(await visibleTo(admin.token)).toEqual(['client-acme', 'general', 'secret']);
  });

  it('shows members public channels plus the private channels they belong to', async () => {
    expect(await visibleTo(member.token)).toEqual(['client-acme', 'general', 'secret']);
    await ctx.prisma.channelMember.delete({
      where: { channelId_userId: { channelId: privateChannelId, userId: member.id } },
    });
    expect(await visibleTo(member.token)).toEqual(['client-acme', 'general']);
  });

  it('shows guests only the channels they were assigned to', async () => {
    expect(await visibleTo(guest.token)).toEqual(['client-acme']);
  });

  describe('creation', () => {
    const create = (token: string, payload: unknown) =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: authHeader(token),
        payload: payload as object,
      });

    it('lets an administrator create a channel and normalizes its name', async () => {
      const response = await create(admin.token, {
        name: '  Projet Client 1 ',
        description: ' Suivi du projet ',
      });
      expect(response.statusCode).toBe(201);
      expect(response.json<CreateChannelResponse>().channel).toMatchObject({
        name: 'projet-client-1',
        description: 'Suivi du projet',
        isPrivate: false,
      });
      expect(await visibleTo(member.token)).toContain('projet-client-1');
    });

    it('accepts accented names', async () => {
      const response = await create(admin.token, { name: 'Réunions' });
      expect(response.statusCode).toBe(201);
      expect(response.json<CreateChannelResponse>().channel.name).toBe('réunions');
    });

    it('refuses members and guests', async () => {
      for (const user of [member, guest]) {
        const response = await create(user.token, { name: 'nope' });
        expect(response.statusCode).toBe(403);
        expect(response.json<ApiErrorBody>().error.code).toBe('forbidden');
      }
    });

    it('refuses a name that is already taken', async () => {
      const response = await create(admin.token, { name: 'GENERAL' });
      expect(response.statusCode).toBe(409);
      expect(response.json<ApiErrorBody>().error.code).toBe('conflict');
    });

    it('refuses invalid names and descriptions', async () => {
      for (const payload of [
        {},
        { name: '' },
        { name: 'a'.repeat(41) },
        { name: 'bad/name' },
        { name: '<script>' },
        { name: 'fine', description: 'x'.repeat(201) },
      ]) {
        const response = await create(admin.token, payload);
        expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      }
    });
  });
});

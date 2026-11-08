import type { ApiErrorBody, LoginResponse, MeResponse } from '@percival/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TEST_PASSWORD,
  authHeader,
  createTestContext,
  createUser,
  tokenFor,
  type TestContext,
} from './helpers/app.js';

describe('authentication', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
    await createUser(ctx.prisma, 'alice', 'admin');
    await createUser(ctx.prisma, 'robot', 'bot');
  });
  afterAll(async () => ctx.close());

  const login = (username: string, password: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });

  it('logs in with valid credentials, case-insensitively on the username', async () => {
    const response = await login('ALICE', TEST_PASSWORD);
    expect(response.statusCode).toBe(200);
    const body = response.json<LoginResponse>();
    expect(body.user).toMatchObject({ username: 'alice', roles: ['admin'], isBot: false });
    expect(JSON.stringify(body)).not.toMatch(/hash|argon2/i);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('gives the same answer for a wrong password and an unknown user', async () => {
    const wrongPassword = await login('alice', 'not-the-password');
    const unknownUser = await login('nobody', TEST_PASSWORD);
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(unknownUser.json<ApiErrorBody>()).toEqual(wrongPassword.json<ApiErrorBody>());
  });

  it('never lets a bot log in with a password', async () => {
    expect((await login('robot', TEST_PASSWORD)).statusCode).toBe(401);
  });

  it('rejects malformed login requests', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorBody>().error.code).toBe('invalid_request');
  });

  it('returns the current user on /me and rejects missing or forged tokens', async () => {
    const alice = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'alice' } });
    const ok = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeader(tokenFor(ctx.app, alice.id)),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<MeResponse>().user.username).toBe('alice');

    const anonymous = await ctx.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(anonymous.statusCode).toBe(401);

    const forged = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeader(`${tokenFor(ctx.app, alice.id)}x`),
    });
    expect(forged.statusCode).toBe(401);
  });

  it('rejects a valid token whose account was deleted', async () => {
    const ghost = await createUser(ctx.prisma, 'ghost', 'member');
    const token = tokenFor(ctx.app, ghost.id);
    await ctx.prisma.user.delete({ where: { id: ghost.id } });
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeader(token),
    });
    expect(response.statusCode).toBe(401);
  });
});

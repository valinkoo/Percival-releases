import type { ApiErrorBody, LoginResponse, MeResponse } from '@percival/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TEST_PASSWORD,
  authHeader,
  createTestContext,
  createUser,
  oldTokenFor,
  tokenFor,
  type TestContext,
} from './helpers/app.js';

const CHOSEN_PASSWORD = 'My-Own-Password-42';

describe('passwords and sessions', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => ctx.close());

  const login = (username: string, password: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });

  const get = (url: string, token: string) =>
    ctx.app.inject({ method: 'GET', url, headers: authHeader(token) });

  const changePassword = (token: string | null, payload: unknown) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: token ? authHeader(token) : {},
      payload: payload as object,
    });

  const code = (response: { json: <T>() => T }) => response.json<ApiErrorBody>().error.code;

  /** A member whose password is a temporary one, as after a creation or a reset. */
  async function temporaryAccount(name: string) {
    const user = await createUser(ctx.prisma, name, 'member');
    await ctx.prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
    return user;
  }

  describe('an account with a temporary password', () => {
    it('can only read its own profile and change its password', async () => {
      const user = await temporaryAccount('newbie');
      const token = tokenFor(ctx.app, user.id);

      const me = await get('/api/auth/me', token);
      expect(me.statusCode).toBe(200);
      expect(me.json<MeResponse>().user.mustChangePassword).toBe(true);

      for (const url of ['/api/channels', '/api/users']) {
        const response = await get(url, token);
        expect(response.statusCode).toBe(403);
        expect(code(response)).toBe('password_change_required');
      }
      const channelId = (await ctx.prisma.channel.findFirstOrThrow()).id;
      const post = await ctx.app.inject({
        method: 'POST',
        url: `/api/channels/${channelId}/messages`,
        headers: authHeader(token),
        payload: { content: 'trop tôt' },
      });
      expect(post.statusCode).toBe(403);
      expect(code(post)).toBe('password_change_required');
      expect(await ctx.prisma.message.count()).toBe(0);
    });

    it('can sign in, and is told it must change its password', async () => {
      await temporaryAccount('newbie2');
      const response = await login('newbie2', TEST_PASSWORD);
      expect(response.statusCode).toBe(200);
      expect(response.json<LoginResponse>().user.mustChangePassword).toBe(true);
    });
  });

  describe('choosing a password', () => {
    it('frees the account, hands back a working token and closes the old sessions', async () => {
      const user = await temporaryAccount('chooser');
      const oldToken = oldTokenFor(ctx.app, user.id);

      const response = await changePassword(oldToken, {
        currentPassword: TEST_PASSWORD,
        newPassword: CHOSEN_PASSWORD,
      });
      expect(response.statusCode).toBe(200);
      const session = response.json<LoginResponse>();
      expect(session.user).toMatchObject({ username: 'chooser', mustChangePassword: false });
      expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(response.body).not.toMatch(/hash|argon2/i);

      // The fresh token opens the whole API...
      expect((await get('/api/channels', session.token)).statusCode).toBe(200);
      // ...the old one is closed, and so is the old password.
      const stale = await get('/api/channels', oldToken);
      expect(stale.statusCode).toBe(401);
      expect((await login('chooser', TEST_PASSWORD)).statusCode).toBe(401);
      expect((await login('chooser', CHOSEN_PASSWORD)).statusCode).toBe(200);
    });

    it('works the same for anyone changing their password on their own', async () => {
      const user = await createUser(ctx.prisma, 'settled', 'member');
      const otherDevice = oldTokenFor(ctx.app, user.id);
      const response = await changePassword(tokenFor(ctx.app, user.id), {
        currentPassword: TEST_PASSWORD,
        newPassword: CHOSEN_PASSWORD,
      });
      expect(response.statusCode).toBe(200);
      expect((await get('/api/channels', response.json<LoginResponse>().token)).statusCode).toBe(
        200,
      );
      expect((await get('/api/channels', otherDevice)).statusCode).toBe(401);
    });

    it('refuses a wrong current password, without closing the session', async () => {
      const user = await createUser(ctx.prisma, 'careless', 'member');
      const token = tokenFor(ctx.app, user.id);
      const response = await changePassword(token, {
        currentPassword: 'not-the-password',
        newPassword: CHOSEN_PASSWORD,
      });
      // 403: a wrong password here must not look like an expired session (401).
      expect(response.statusCode).toBe(403);
      expect(code(response)).toBe('invalid_credentials');
      expect((await get('/api/channels', token)).statusCode).toBe(200);
      expect((await login('careless', TEST_PASSWORD)).statusCode).toBe(200);
    });

    it('refuses a new password that breaks the policy or repeats the current one', async () => {
      const user = await createUser(ctx.prisma, 'picky', 'member');
      const token = tokenFor(ctx.app, user.id);
      const tooShort = await changePassword(token, {
        currentPassword: TEST_PASSWORD,
        newPassword: 'short',
      });
      expect(tooShort.statusCode).toBe(400);
      const same = await changePassword(token, {
        currentPassword: TEST_PASSWORD,
        newPassword: TEST_PASSWORD,
      });
      expect(same.statusCode).toBe(400);
      const missing = await changePassword(token, { newPassword: CHOSEN_PASSWORD });
      expect(missing.statusCode).toBe(400);
      expect((await login('picky', TEST_PASSWORD)).statusCode).toBe(200);
    });

    it('requires a token, and never works for a bot', async () => {
      expect(
        (
          await changePassword(null, {
            currentPassword: TEST_PASSWORD,
            newPassword: CHOSEN_PASSWORD,
          })
        ).statusCode,
      ).toBe(401);
      const robot = await createUser(ctx.prisma, 'robot', 'bot');
      const response = await changePassword(tokenFor(ctx.app, robot.id), {
        currentPassword: TEST_PASSWORD,
        newPassword: CHOSEN_PASSWORD,
      });
      expect(response.statusCode).toBe(403);
      const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: robot.id } });
      expect(stored.passwordHash).toBeNull();
    });
  });

  describe('a disabled account', () => {
    it('cannot sign in, but only someone who knows the password learns why', async () => {
      const user = await createUser(ctx.prisma, 'fired', 'member');
      await ctx.prisma.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });

      const right = await login('fired', TEST_PASSWORD);
      expect(right.statusCode).toBe(403);
      expect(code(right)).toBe('account_disabled');

      const wrong = await login('fired', 'not-the-password');
      expect(wrong.statusCode).toBe(401);
      expect(code(wrong)).toBe('invalid_credentials');
    });

    it('is turned away on every route, even with a token issued before', async () => {
      const user = await createUser(ctx.prisma, 'fired2', 'admin');
      const token = tokenFor(ctx.app, user.id);
      expect((await get('/api/channels', token)).statusCode).toBe(200);

      await ctx.prisma.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
      for (const url of ['/api/channels', '/api/users', '/api/auth/me']) {
        const response = await get(url, token);
        expect(response.statusCode).toBe(403);
        expect(code(response)).toBe('account_disabled');
      }
    });

    it('does not get its old sessions back when it is re-enabled', async () => {
      const user = await createUser(ctx.prisma, 'comeback', 'member');
      const oldToken = oldTokenFor(ctx.app, user.id);
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { disabledAt: new Date(), sessionsRevokedBefore: new Date() },
      });
      await ctx.prisma.user.update({ where: { id: user.id }, data: { disabledAt: null } });

      expect((await get('/api/channels', oldToken)).statusCode).toBe(401);
      const fresh = await login('comeback', TEST_PASSWORD);
      expect(fresh.statusCode).toBe(200);
      expect((await get('/api/channels', fresh.json<LoginResponse>().token)).statusCode).toBe(200);
    });
  });
});

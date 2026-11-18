import type {
  ApiErrorBody,
  LoginResponse,
  ManagedUserDto,
  RoleName,
  UserResponse,
  UsersResponse,
} from '@percival/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TEST_PASSWORD,
  authHeader,
  createTestContext,
  createUser,
  tokenFor,
  type TestContext,
} from './helpers/app.js';

const NEW_PASSWORD = 'Temporary-Pass-0001';

describe('user administration', () => {
  let ctx: TestContext;
  const tokens = new Map<string, string>();
  const ids = new Map<string, string>();

  /** An account of the given role, with a token ready to use. */
  async function account(name: string, role: RoleName): Promise<void> {
    const user = await createUser(ctx.prisma, name, role);
    ids.set(name, user.id);
    tokens.set(name, tokenFor(ctx.app, user.id));
  }

  beforeAll(async () => {
    ctx = await createTestContext();
    await account('root', 'admin');
    await account('root2', 'admin');
    await account('modo', 'moderator');
    await account('modo2', 'moderator');
    await account('bob', 'member');
    await account('gus', 'guest');
    await account('robot', 'bot');
  });
  afterAll(async () => ctx.close());

  const call = (
    method: 'GET' | 'POST' | 'PATCH',
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
  const id = (name: string) => ids.get(name) as string;
  const roleRows = (name: string) => ctx.prisma.userRole.count({ where: { userId: id(name) } });

  describe('listing', () => {
    const names = async (as: string) => {
      const response = await call('GET', '/api/users', as);
      expect(response.statusCode).toBe(200);
      return response
        .json<UsersResponse>()
        .users.map((user) => user.username)
        .sort();
    };

    it('shows an admin every person, other admins included, but no bot', async () => {
      expect(await names('root')).toEqual(['bob', 'gus', 'modo', 'modo2', 'root', 'root2']);
    });

    it('shows a moderator only the ranks below theirs', async () => {
      expect(await names('modo')).toEqual(['bob', 'gus']);
    });

    it('describes each account without any secret', async () => {
      const response = await call('GET', '/api/users', 'root');
      const bob = response.json<UsersResponse>().users.find((user) => user.username === 'bob');
      expect(bob).toEqual({
        id: id('bob'),
        username: 'bob',
        role: 'member',
        active: true,
        mustChangePassword: false,
        createdAt: expect.any(String) as string,
      } satisfies ManagedUserDto);
      expect(response.body).not.toMatch(/hash|argon2/i);
    });

    it('refuses members, guests and anonymous callers', async () => {
      expect((await call('GET', '/api/users', 'bob')).statusCode).toBe(403);
      expect((await call('GET', '/api/users', 'gus')).statusCode).toBe(403);
      expect((await call('GET', '/api/users', null)).statusCode).toBe(401);
    });
  });

  describe('creation', () => {
    const create = (as: string | null, payload: unknown) => call('POST', '/api/users', as, payload);
    const body = (username: string, role: string, password = NEW_PASSWORD) => ({
      username,
      password,
      role,
    });

    it('lets an admin create a moderator, a member and a guest, with a temporary password', async () => {
      for (const role of ['moderator', 'member', 'guest'] as const) {
        const response = await create('root', body(`new-${role}`, role));
        expect(response.statusCode).toBe(201);
        expect(response.json<UserResponse>().user).toMatchObject({
          username: `new-${role}`,
          role,
          active: true,
          mustChangePassword: true,
        });
        expect(response.body).not.toMatch(/hash|argon2/i);
      }
      // The new account signs in with the temporary password and learns it must change it.
      const login = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'new-member', password: NEW_PASSWORD },
      });
      expect(login.statusCode).toBe(200);
      expect(login.json<LoginResponse>().user.mustChangePassword).toBe(true);
    });

    it('lets a moderator create members and guests only', async () => {
      expect((await create('modo', body('by-modo-m', 'member'))).statusCode).toBe(201);
      expect((await create('modo', body('by-modo-g', 'guest'))).statusCode).toBe(201);
      for (const role of ['moderator', 'admin']) {
        const response = await create('modo', body(`by-modo-${role}`, role));
        expect(response.statusCode).toBe(403);
        expect(code(response)).toBe('forbidden');
      }
      expect(await ctx.prisma.user.count({ where: { username: 'by-modo-admin' } })).toBe(0);
    });

    it('never lets anyone create an admin or a bot through the API', async () => {
      expect((await create('root', body('wannabe-admin', 'admin'))).statusCode).toBe(403);
      expect((await create('root', body('wannabe-bot', 'bot'))).statusCode).toBe(400);
      expect((await create('root', body('wannabe-boss', 'superuser'))).statusCode).toBe(400);
    });

    it('refuses members, guests and anonymous callers', async () => {
      expect((await create('bob', body('x-by-bob', 'guest'))).statusCode).toBe(403);
      expect((await create('gus', body('x-by-gus', 'guest'))).statusCode).toBe(403);
      expect((await create(null, body('x-anon', 'guest'))).statusCode).toBe(401);
      expect(await ctx.prisma.user.count({ where: { username: { startsWith: 'x-' } } })).toBe(0);
    });

    it('refuses a name already taken, whatever its case', async () => {
      const response = await create('root', body('BOB', 'guest'));
      expect(response.statusCode).toBe(409);
      expect(code(response)).toBe('conflict');
    });

    it('applies the username and password rules', async () => {
      expect((await create('root', body('ab', 'guest'))).statusCode).toBe(400);
      expect((await create('root', body('has space', 'guest'))).statusCode).toBe(400);
      expect((await create('root', body('short-pass', 'guest', 'short'))).statusCode).toBe(400);
      expect(
        (await create('root', { username: 'no-role', password: NEW_PASSWORD })).statusCode,
      ).toBe(400);
    });

    it('gives the account exactly one role', async () => {
      await create('root', body('single-role', 'member'));
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'single-role' } });
      expect(await ctx.prisma.userRole.count({ where: { userId: user.id } })).toBe(1);
    });
  });

  describe('changing a role', () => {
    const setRole = (as: string | null, target: string, role: unknown) =>
      call('PATCH', `/api/users/${id(target)}`, as, { role });

    it('lets an admin promote and demote accounts below them', async () => {
      await account('promoted', 'member');
      const up = await setRole('root', 'promoted', 'moderator');
      expect(up.statusCode).toBe(200);
      expect(up.json<UserResponse>().user.role).toBe('moderator');
      expect(await roleRows('promoted')).toBe(1);

      const down = await setRole('root', 'promoted', 'guest');
      expect(down.json<UserResponse>().user.role).toBe('guest');
      expect(await roleRows('promoted')).toBe(1);
    });

    it('never makes an admin, and never touches another admin or oneself', async () => {
      await account('target', 'member');
      expect((await setRole('root', 'target', 'admin')).statusCode).toBe(403);
      expect((await setRole('root', 'root2', 'member')).statusCode).toBe(403);
      expect((await setRole('root', 'root', 'member')).statusCode).toBe(403);
      const roles = await ctx.prisma.userRole.findMany({
        where: { userId: id('root2') },
        include: { role: true },
      });
      expect(roles.map((row) => row.role.name)).toEqual(['admin']);
    });

    it('does not let a moderator change any role, even below theirs', async () => {
      await account('lowly', 'member');
      const response = await setRole('modo', 'lowly', 'guest');
      expect(response.statusCode).toBe(403);
      expect(code(response)).toBe('forbidden');
      expect(
        await ctx.prisma.userRole.count({
          where: { userId: id('lowly'), role: { name: 'member' } },
        }),
      ).toBe(1);
    });

    it('answers a moderator the same way whatever the target, so nothing leaks about accounts', async () => {
      const unknown = await call('PATCH', `/api/users/${crypto.randomUUID()}`, 'modo', {
        role: 'guest',
      });
      expect(unknown.statusCode).toBe(403);
      for (const target of ['root', 'modo2', 'modo', 'bob']) {
        expect((await setRole('modo', target, 'guest')).statusCode).toBe(403);
      }
    });

    it('refuses members, guests and anonymous callers', async () => {
      expect((await setRole('bob', 'gus', 'guest')).statusCode).toBe(403);
      expect((await setRole('gus', 'bob', 'guest')).statusCode).toBe(403);
      expect((await setRole(null, 'bob', 'guest')).statusCode).toBe(401);
    });

    it('rejects unknown accounts, bots and malformed requests', async () => {
      expect(
        (await call('PATCH', `/api/users/${crypto.randomUUID()}`, 'root', { role: 'guest' }))
          .statusCode,
      ).toBe(404);
      expect((await setRole('root', 'robot', 'guest')).statusCode).toBe(404);
      expect(
        (await call('PATCH', '/api/users/not-a-uuid', 'root', { role: 'guest' })).statusCode,
      ).toBe(400);
      expect((await call('PATCH', `/api/users/${id('bob')}`, 'root', {})).statusCode).toBe(400);
      expect((await setRole('root', 'bob', 'bot')).statusCode).toBe(400);
    });
  });

  describe('disabling and re-enabling', () => {
    const setActive = (as: string | null, target: string, active: unknown) =>
      call('PATCH', `/api/users/${id(target)}`, as, { active });

    it('lets a moderator disable and re-enable a member', async () => {
      await account('victim', 'member');
      const off = await setActive('modo', 'victim', false);
      expect(off.statusCode).toBe(200);
      expect(off.json<UserResponse>().user.active).toBe(false);
      const on = await setActive('modo', 'victim', true);
      expect(on.json<UserResponse>().user.active).toBe(true);
    });

    it('lets an admin disable a moderator', async () => {
      await account('modo3', 'moderator');
      const response = await setActive('root', 'modo3', false);
      expect(response.json<UserResponse>().user.active).toBe(false);
    });

    it('never lets anyone disable an equal or higher rank, or themselves', async () => {
      expect((await setActive('root', 'root2', false)).statusCode).toBe(403);
      expect((await setActive('root', 'root', false)).statusCode).toBe(403);
      expect((await setActive('modo', 'root', false)).statusCode).toBe(404);
      expect((await setActive('modo', 'modo2', false)).statusCode).toBe(404);
      const rows = await ctx.prisma.user.findMany({
        where: { id: { in: [id('root'), id('root2'), id('modo2')] } },
      });
      expect(rows.every((row) => row.disabledAt === null)).toBe(true);
    });

    it('refuses members, guests and anonymous callers', async () => {
      expect((await setActive('bob', 'gus', false)).statusCode).toBe(403);
      expect((await setActive(null, 'gus', false)).statusCode).toBe(401);
      const gus = await ctx.prisma.user.findUniqueOrThrow({ where: { id: id('gus') } });
      expect(gus.disabledAt).toBeNull();
    });

    it('treats a repeated request as a no-op', async () => {
      await account('twice', 'guest');
      await setActive('root', 'twice', false);
      const first = await ctx.prisma.user.findUniqueOrThrow({ where: { id: id('twice') } });
      const again = await setActive('root', 'twice', false);
      expect(again.statusCode).toBe(200);
      const second = await ctx.prisma.user.findUniqueOrThrow({ where: { id: id('twice') } });
      expect(second.disabledAt).toEqual(first.disabledAt);
    });
  });

  describe('resetting a password', () => {
    const reset = (as: string | null, target: string, password: unknown) =>
      call('POST', `/api/users/${id(target)}/password`, as, { password });

    it('lets a moderator reset a member, who must then choose their own password', async () => {
      await account('forgetful', 'member');
      const response = await reset('modo', 'forgetful', NEW_PASSWORD);
      expect(response.statusCode).toBe(200);
      expect(response.json<UserResponse>().user.mustChangePassword).toBe(true);

      const oldLogin = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'forgetful', password: TEST_PASSWORD },
      });
      expect(oldLogin.statusCode).toBe(401);
      const newLogin = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'forgetful', password: NEW_PASSWORD },
      });
      expect(newLogin.statusCode).toBe(200);
      expect(newLogin.json<LoginResponse>().user.mustChangePassword).toBe(true);
    });

    it('lets an admin reset a moderator', async () => {
      await account('modo4', 'moderator');
      expect((await reset('root', 'modo4', NEW_PASSWORD)).statusCode).toBe(200);
    });

    it('never lets anyone reset an equal or higher rank, or their own password this way', async () => {
      expect((await reset('root', 'root2', NEW_PASSWORD)).statusCode).toBe(403);
      expect((await reset('root', 'root', NEW_PASSWORD)).statusCode).toBe(403);
      expect((await reset('modo', 'root', NEW_PASSWORD)).statusCode).toBe(404);
      expect((await reset('modo', 'modo2', NEW_PASSWORD)).statusCode).toBe(404);
      const login = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'root2', password: TEST_PASSWORD },
      });
      expect(login.statusCode).toBe(200);
    });

    it('applies the password policy and refuses members and anonymous callers', async () => {
      expect((await reset('root', 'bob', 'short')).statusCode).toBe(400);
      expect((await reset('bob', 'gus', NEW_PASSWORD)).statusCode).toBe(403);
      expect((await reset(null, 'gus', NEW_PASSWORD)).statusCode).toBe(401);
      expect((await reset('root', 'robot', NEW_PASSWORD)).statusCode).toBe(404);
    });
  });
});

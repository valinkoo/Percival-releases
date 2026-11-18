import {
  PERMISSIONS,
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  ROLE_RANK,
  assignableRoles,
  hasPermission,
  outranks,
  rankOf,
  topRole,
} from '@percival/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './helpers/app.js';

describe('role hierarchy', () => {
  it('ranks admin > moderator > member > guest, with the bot below everyone', () => {
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.moderator);
    expect(ROLE_RANK.moderator).toBeGreaterThan(ROLE_RANK.member);
    expect(ROLE_RANK.member).toBeGreaterThan(ROLE_RANK.guest);
    expect(ROLE_RANK.guest).toBeGreaterThan(ROLE_RANK.bot);
  });

  it('outranks only strictly: nobody acts on an equal rank', () => {
    expect(outranks(['admin'], ['moderator'])).toBe(true);
    expect(outranks(['moderator'], ['member'])).toBe(true);
    expect(outranks(['moderator'], ['bot'])).toBe(true);
    expect(outranks(['admin'], ['admin'])).toBe(false);
    expect(outranks(['moderator'], ['moderator'])).toBe(false);
    expect(outranks(['moderator'], ['admin'])).toBe(false);
    expect(outranks(['member'], ['guest'])).toBe(true);
    expect(outranks([], ['guest'])).toBe(false);
  });

  it('uses the highest rank of an account that has several roles', () => {
    expect(rankOf(['guest', 'moderator'])).toBe(ROLE_RANK.moderator);
    expect(topRole(['guest', 'moderator'])).toBe('moderator');
    expect(topRole([])).toBeNull();
    expect(rankOf([])).toBe(-1);
  });

  it('only lets one give a role strictly below their own, never the bot role', () => {
    expect(assignableRoles(['admin'])).toEqual(['moderator', 'member', 'guest']);
    expect(assignableRoles(['moderator'])).toEqual(['member', 'guest']);
    expect(assignableRoles(['member'])).toEqual(['guest']);
    expect(assignableRoles(['guest'])).toEqual([]);
    expect(assignableRoles(['bot'])).toEqual([]);
  });

  it('gives the admin every permission and the moderator all but the role change', () => {
    expect([...ROLE_PERMISSIONS.admin].sort()).toEqual([...PERMISSIONS].sort());
    expect(hasPermission(['moderator'], 'user.role')).toBe(false);
    for (const permission of PERMISSIONS.filter((candidate) => candidate !== 'user.role')) {
      expect(hasPermission(['moderator'], permission)).toBe(true);
    }
  });

  it('gives members, guests and bots no permission at all', () => {
    for (const role of ['member', 'guest', 'bot'] as const) {
      for (const permission of PERMISSIONS) {
        expect(hasPermission([role], permission)).toBe(false);
      }
    }
  });
});

describe('roles table', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => ctx.close());

  it('copies every role, its rank and its permissions from the code at startup', async () => {
    const rows = await ctx.prisma.role.findMany();
    expect(rows.map((row) => row.name).sort()).toEqual([...ROLE_NAMES].sort());
    for (const row of rows) {
      const name = row.name as (typeof ROLE_NAMES)[number];
      expect(row.rank).toBe(ROLE_RANK[name]);
      expect(Object.keys(row.permissions as object).sort()).toEqual(
        [...ROLE_PERMISSIONS[name]].sort(),
      );
    }
  });
});

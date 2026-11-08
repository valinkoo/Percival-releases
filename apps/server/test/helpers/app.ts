import type { RoleName } from '@percival/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { ensureDefaultChannel, ensureRoles } from '../../src/bootstrap.js';
import { loadConfig, type Config } from '../../src/config.js';
import { createPrismaClient, type PrismaClient } from '../../src/db.js';
import { hashPassword } from '../../src/security/password.js';
import { testDatabaseUrl } from './env.js';

export const TEST_PASSWORD = 'Correct-Horse-Battery-1';

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  config: Config;
  close(): Promise<void>;
}

export async function createTestContext(
  overrides: Record<string, string> = {},
): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: testDatabaseUrl(),
    JWT_SECRET: 'test-secret-test-secret-test-secret-123456',
    ...overrides,
  });
  const prisma = createPrismaClient(config.DATABASE_URL);
  const app = await buildApp({ config, prisma });
  await app.ready();
  await resetDatabase(prisma);
  return {
    app,
    prisma,
    config,
    async close() {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

/** Empties every table, then restores what the server creates at startup. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE webhooks, access_tokens, attachments, messages, channel_members, channels, user_roles, roles, users RESTART IDENTITY CASCADE',
  );
  await ensureRoles(prisma);
  await ensureDefaultChannel(prisma);
}

let cachedHash: Promise<string> | undefined;

export async function createUser(
  prisma: PrismaClient,
  username: string,
  role: RoleName,
): Promise<{ id: string; username: string }> {
  cachedHash ??= hashPassword(TEST_PASSWORD);
  const roleRow = await prisma.role.findUniqueOrThrow({ where: { name: role } });
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: role === 'bot' ? null : await cachedHash,
      isBot: role === 'bot',
      roles: { create: { roleId: roleRow.id } },
    },
  });
  return { id: user.id, username: user.username };
}

/** A signed JWT for a user, valid for the configured duration unless `expiresIn` is given. */
export function tokenFor(app: FastifyInstance, userId: string, expiresIn?: string): string {
  return app.jwt.sign({ sub: userId }, expiresIn ? { expiresIn } : {});
}

export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

import { ROLE_NAMES, ROLE_PERMISSIONS, ROLE_RANK } from '@percival/shared';
import type { z } from 'zod';
import type { PrismaClient } from './db.js';
import { hashPassword } from './security/password.js';
import { newPasswordSchema, usernameSchema } from './users/validation.js';

/**
 * Makes sure every global role exists and copies its rank and permissions from the code (the
 * source of truth) into the table. Safe to run at each startup.
 */
export async function ensureRoles(prisma: PrismaClient): Promise<void> {
  for (const name of ROLE_NAMES) {
    const data = {
      rank: ROLE_RANK[name],
      permissions: Object.fromEntries(
        ROLE_PERMISSIONS[name].map((permission) => [permission, true]),
      ),
    };
    await prisma.role.upsert({ where: { name }, update: data, create: { name, ...data } });
  }
}

/** Creates the default channel on a fresh installation, so there is somewhere to write. */
export async function ensureDefaultChannel(prisma: PrismaClient): Promise<void> {
  if ((await prisma.channel.count()) === 0) {
    await prisma.channel.create({
      data: { name: 'general', description: 'Discussions générales' },
    });
  }
}

export type CreateFirstAdminResult =
  { status: 'created'; username: string } | { status: 'already_exists' };

function parseField<T>(schema: z.ZodType<T>, label: string, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const reasons = result.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid ${label}: ${reasons}`);
  }
  return result.data;
}

/**
 * Creates the first administrator. Does nothing when an admin already exists, so it can be
 * called at every startup and cannot be abused to add accounts later.
 * Throws an Error with a readable message if the username or password breaks the rules.
 */
export async function createFirstAdmin(
  prisma: PrismaClient,
  input: { username: string; password: string },
): Promise<CreateFirstAdminResult> {
  const username = parseField(usernameSchema, 'username', input.username);
  const password = parseField(newPasswordSchema, 'password', input.password);

  const existingAdmin = await prisma.userRole.findFirst({
    where: { role: { name: 'admin' } },
    select: { userId: true },
  });
  if (existingAdmin) {
    return { status: 'already_exists' };
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
  await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      roles: { create: { roleId: adminRole.id } },
    },
  });
  return { status: 'created', username };
}

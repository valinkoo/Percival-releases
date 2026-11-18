import {
  assignableRoles,
  outranks,
  type HumanRoleName,
  type ManagedUserDto,
} from '@percival/shared';
import type { PrismaClient } from '../db.js';
import { AppError } from '../errors.js';
import type { Realtime } from '../realtime/hub.js';
import { hashPassword } from '../security/password.js';
import { isAdmin, requirePermission, type Account } from './account.js';
import { roleNamesOf, toManagedUserDto, toUserDto, userInclude } from './serialize.js';

interface Deps {
  prisma: PrismaClient;
  realtime: Realtime;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function userNotFound(): AppError {
  return new AppError(404, 'not_found', 'User not found');
}

function forbidden(message: string): AppError {
  return new AppError(403, 'forbidden', message);
}

type UserRow = Awaited<ReturnType<typeof loadPerson>>;

/** A person's row (never a bot: bots have their own screen in v0.0.6), with their roles. */
function loadPerson(prisma: PrismaClient, userId: string) {
  return prisma.user.findFirst({ where: { id: userId, isBot: false }, include: userInclude });
}

/** Admins see every account; anyone else only sees the accounts they outrank. */
function canSee(actor: Account, target: NonNullable<UserRow>): boolean {
  return isAdmin(actor) || outranks(actor.roles, roleNamesOf(target));
}

/**
 * The account to act on. Whether it does not exist or the actor may not even see it, the answer is
 * the same 404; an account the actor sees but does not outrank (another admin, themselves) is a 403.
 */
async function findActionableUser(prisma: PrismaClient, actor: Account, userId: string) {
  const target = await loadPerson(prisma, userId);
  if (!target || !canSee(actor, target)) throw userNotFound();
  if (!outranks(actor.roles, roleNamesOf(target))) {
    throw forbidden('You can only act on accounts of a lower rank than yours');
  }
  return target;
}

export async function listUsers(
  { prisma }: Pick<Deps, 'prisma'>,
  actor: Account,
): Promise<ManagedUserDto[]> {
  requirePermission(actor, 'user.list');
  const rows = await prisma.user.findMany({
    where: { isBot: false },
    include: userInclude,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.filter((row) => canSee(actor, row)).map(toManagedUserDto);
}

/** Creates an account with a temporary password: its owner must change it at the first sign-in. */
export async function createUser(
  { prisma }: Pick<Deps, 'prisma'>,
  actor: Account,
  input: { username: string; password: string; role: HumanRoleName },
): Promise<ManagedUserDto> {
  requirePermission(actor, 'user.create');
  if (!assignableRoles(actor.roles).includes(input.role)) {
    throw forbidden('You can only give a role below your own');
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { name: input.role } });
  try {
    const user = await prisma.user.create({
      data: {
        username: input.username,
        passwordHash: await hashPassword(input.password),
        mustChangePassword: true,
        roles: { create: { roleId: role.id } },
      },
      include: userInclude,
    });
    return toManagedUserDto(user);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'conflict', 'A user with this name already exists');
    }
    throw error;
  }
}

/**
 * Changes someone's role (admins only) and/or disables or re-enables the account. Everything is
 * checked before anything is written.
 */
export async function updateUser(
  { prisma, realtime }: Deps,
  actor: Account,
  userId: string,
  changes: { role?: HumanRoleName | undefined; active?: boolean | undefined },
): Promise<ManagedUserDto> {
  // The right comes first, whoever the target is: someone who never has it learns nothing about
  // which accounts exist.
  if (changes.role !== undefined) requirePermission(actor, 'user.role');
  if (changes.active !== undefined) requirePermission(actor, 'user.manage');

  const target = await findActionableUser(prisma, actor, userId);
  if (changes.role !== undefined && !assignableRoles(actor.roles).includes(changes.role)) {
    throw forbidden('You can only give a role below your own');
  }
  const roleChange = changes.role !== undefined && !roleNamesOf(target).includes(changes.role);
  const disabling = changes.active === false && target.disabledAt === null;
  const enabling = changes.active === true && target.disabledAt !== null;

  if (roleChange && changes.role !== undefined) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: changes.role } });
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId } }),
      prisma.userRole.create({ data: { userId, roleId: role.id } }),
    ]);
  }
  if (disabling || enabling) {
    await prisma.user.update({
      where: { id: userId },
      data: disabling
        ? // Old tokens stay refused after a later re-enabling: the person signs in again.
          { disabledAt: new Date(), sessionsRevokedBefore: new Date() }
        : { disabledAt: null },
    });
  }

  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: userInclude,
  });
  if (disabling) {
    realtime.disconnectUser(userId);
  } else if (roleChange) {
    // The role decides which channels the person sees and what their screens offer.
    realtime.publishAccountUpdated(toUserDto(updated));
    await realtime.syncUser(userId);
  }
  return toManagedUserDto(updated);
}

/** Gives the account a new temporary password and closes its sessions. */
export async function resetPassword(
  { prisma, realtime }: Deps,
  actor: Account,
  userId: string,
  password: string,
): Promise<ManagedUserDto> {
  requirePermission(actor, 'user.manage');
  await findActionableUser(prisma, actor, userId);
  const revokedBefore = new Date();
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      sessionsRevokedBefore: revokedBefore,
    },
    include: userInclude,
  });
  realtime.closeSessionsBefore(userId, revokedBefore);
  return toManagedUserDto(updated);
}

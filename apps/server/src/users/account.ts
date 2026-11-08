import type { UserDto } from '@percival/shared';
import type { PrismaClient } from '../db.js';
import { toUserDto, userInclude } from './serialize.js';

/** The authenticated user, as loaded from the database on each request. */
export type Account = UserDto;

export async function loadAccount(prisma: PrismaClient, userId: string): Promise<Account | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: userInclude });
  return user ? toUserDto(user) : null;
}

export function isAdmin(account: Account): boolean {
  return account.roles.includes('admin');
}

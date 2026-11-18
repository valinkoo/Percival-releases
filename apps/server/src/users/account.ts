import { hasPermission, type Permission, type UserDto } from '@percival/shared';
import type { PrismaClient } from '../db.js';
import { AppError } from '../errors.js';
import { toUserDto, userInclude } from './serialize.js';

/** The authenticated user, as loaded from the database on each request. */
export type Account = UserDto;

/** An account with what the server needs to decide whether its sessions are still welcome. */
export interface AccountState {
  account: Account;
  /** An administrator disabled the account. */
  disabled: boolean;
  /** Tokens issued before this instant are refused (password changed or reset, deactivation). */
  sessionsRevokedBefore: Date | null;
}

export async function loadAccountState(
  prisma: PrismaClient,
  userId: string,
): Promise<AccountState | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: userInclude });
  if (!user) return null;
  return {
    account: toUserDto(user),
    disabled: user.disabledAt !== null,
    sessionsRevokedBefore: user.sessionsRevokedBefore,
  };
}

/**
 * Whether a token, issued at `issuedAt` (JWT `iat`, in seconds), predates the account's last
 * revocation. Compared by the second, the precision of `iat`: a token signed in the very second
 * of a password change (the fresh one the change hands back) stays valid.
 */
export function isRevoked(state: AccountState, issuedAt: number): boolean {
  return (
    state.sessionsRevokedBefore !== null &&
    issuedAt < Math.floor(state.sessionsRevokedBefore.getTime() / 1000)
  );
}

export function isAdmin(account: Pick<Account, 'roles'>): boolean {
  return account.roles.includes('admin');
}

export function can(account: Pick<Account, 'roles'>, permission: Permission): boolean {
  return hasPermission(account.roles, permission);
}

/** Throws a 403 unless the account's role grants the permission. */
export function requirePermission(account: Pick<Account, 'roles'>, permission: Permission): void {
  if (!can(account, permission)) {
    throw new AppError(403, 'forbidden', 'You are not allowed to do this');
  }
}

import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { isAdmin, type Account } from '../users/account.js';

/**
 * Who can see a channel (DAT, section 6; roles are global, see the amendments):
 * - admins see every channel;
 * - anyone listed in `channel_members` sees that channel;
 * - public channels are visible to everyone except guests, who only get the channels they were
 *   explicitly assigned to;
 * - private channels need a membership.
 *
 * `isMember` is whether the account has a `channel_members` row for this channel.
 */
export function canViewChannel(
  account: Pick<Account, 'roles'>,
  channel: { isPrivate: boolean },
  isMember: boolean,
): boolean {
  if (account.roles.includes('admin') || isMember) return true;
  if (channel.isPrivate) return false;
  return !account.roles.includes('guest');
}

/** Prisma filter selecting the channels `canViewChannel` accepts, for one account. */
export function accessibleChannelsWhere(account: Account): Prisma.ChannelWhereInput {
  if (isAdmin(account)) return {};
  const conditions: Prisma.ChannelWhereInput[] = [{ members: { some: { userId: account.id } } }];
  if (!account.roles.includes('guest')) {
    conditions.push({ isPrivate: false });
  }
  return { OR: conditions };
}

export function listAccessibleChannels(prisma: PrismaClient, account: Account) {
  return prisma.channel.findMany({
    where: accessibleChannelsWhere(account),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

/** Returns the channel, or `null` when it does not exist or the account cannot see it. */
export function findAccessibleChannel(prisma: PrismaClient, account: Account, channelId: string) {
  return prisma.channel.findFirst({
    where: { id: channelId, ...accessibleChannelsWhere(account) },
  });
}

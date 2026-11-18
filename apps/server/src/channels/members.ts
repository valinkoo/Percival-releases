import { topRole, type ChannelMemberDto, type ChannelMembersResponse } from '@percival/shared';
import type { PrismaClient } from '../db.js';
import { AppError } from '../errors.js';
import { channelNotFound } from '../messages/service.js';
import type { Realtime } from '../realtime/hub.js';
import { requirePermission, type Account } from '../users/account.js';
import { roleNamesOf, userInclude } from '../users/serialize.js';
import { findAccessibleChannel } from './access.js';

interface Deps {
  prisma: PrismaClient;
  realtime: Realtime;
}

interface PersonRow {
  id: string;
  username: string;
  isBot: boolean;
  roles: { role: { name: string } }[];
}

function toMemberDto(person: PersonRow): ChannelMemberDto {
  // An account without a role cannot happen through the API; it is shown as the lowest one.
  return {
    id: person.id,
    username: person.username,
    role: topRole(roleNamesOf(person)) ?? 'guest',
  };
}

/**
 * The channel's explicit members and the people that could be added. Does not check the actor's
 * rights: callers do, and may call it after a change that removed the actor's own access.
 */
async function describeMembers(
  prisma: PrismaClient,
  channel: { id: string; isPrivate: boolean },
): Promise<ChannelMembersResponse> {
  const rows = await prisma.channelMember.findMany({
    where: { channelId: channel.id },
    include: { user: { include: userInclude } },
  });
  const members = rows
    .map((row) => toMemberDto(row.user))
    .sort((a, b) => a.username.localeCompare(b.username));
  const memberIds = members.map((member) => member.id);

  const others = await prisma.user.findMany({
    where: { isBot: false, disabledAt: null, id: { notIn: memberIds } },
    include: userInclude,
    orderBy: { username: 'asc' },
  });
  const candidates = others
    .map(toMemberDto)
    // Admins see every channel already. On a public channel everyone but the guests sees it
    // anyway: listing someone there only matters for a guest.
    .filter((person) => person.role !== 'admin' && (channel.isPrivate || person.role === 'guest'));
  return { members, candidates };
}

async function findManagedChannel(prisma: PrismaClient, actor: Account, channelId: string) {
  requirePermission(actor, 'channel.members');
  // A channel the actor cannot see is a 404 for them, as everywhere else.
  const channel = await findAccessibleChannel(prisma, actor, channelId);
  if (!channel) throw channelNotFound();
  return channel;
}

export async function listChannelMembers(
  { prisma }: Pick<Deps, 'prisma'>,
  actor: Account,
  channelId: string,
): Promise<ChannelMembersResponse> {
  return describeMembers(prisma, await findManagedChannel(prisma, actor, channelId));
}

/** Adds a person to the channel (nothing changes if they are already in). */
export async function addChannelMember(
  { prisma, realtime }: Deps,
  actor: Account,
  channelId: string,
  userId: string,
): Promise<ChannelMembersResponse> {
  const channel = await findManagedChannel(prisma, actor, channelId);
  const target = await prisma.user.findFirst({
    where: { id: userId, isBot: false, disabledAt: null },
    select: { id: true },
  });
  if (!target) {
    throw new AppError(404, 'not_found', 'User not found');
  }
  await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId },
    update: {},
  });
  await realtime.syncUser(userId);
  return describeMembers(prisma, channel);
}

/** Removes a person from the channel (nothing changes if they were not in). */
export async function removeChannelMember(
  { prisma, realtime }: Deps,
  actor: Account,
  channelId: string,
  userId: string,
): Promise<ChannelMembersResponse> {
  const channel = await findManagedChannel(prisma, actor, channelId);
  await prisma.channelMember.deleteMany({ where: { channelId, userId } });
  await realtime.syncUser(userId);
  return describeMembers(prisma, channel);
}

import {
  MESSAGES_PAGE_DEFAULT,
  hasPermission,
  outranks,
  type DeleteMessageResponse,
  type MarkChannelReadResponse,
  type MessageDto,
  type MessagesPageResponse,
} from '@percival/shared';
import type { StoredFile } from '../attachments/storage.js';
import { findAccessibleChannel } from '../channels/access.js';
import type { PrismaClient } from '../db.js';
import { AppError } from '../errors.js';
import type { Realtime } from '../realtime/hub.js';
import type { Account } from '../users/account.js';
import { authorRole, messageInclude, toMessageDto } from './serialize.js';

interface Deps {
  prisma: PrismaClient;
  realtime: Realtime;
}

export function channelNotFound(): AppError {
  // Same answer whether the channel does not exist or is not visible to the account.
  return new AppError(404, 'not_found', 'Channel not found');
}

/**
 * Stores a message and pushes it to everyone who can see the channel. The files, already written
 * to disk by the caller, are linked to it in the same insert; a message needs text or a file.
 */
export async function postMessage(
  { prisma, realtime }: Deps,
  account: Account,
  channelId: string,
  content: string,
  files: readonly StoredFile[] = [],
): Promise<MessageDto> {
  if (!(await findAccessibleChannel(prisma, account, channelId))) {
    throw channelNotFound();
  }
  if (content.trim() === '' && files.length === 0) {
    throw new AppError(400, 'invalid_request', 'A message needs text or a file');
  }
  const uploadedAt = Date.now();
  const row = await prisma.message.create({
    data: {
      channelId,
      userId: account.id,
      content,
      attachments: {
        // One millisecond apart: the upload order is what the history sorts by.
        create: files.map((file, index) => ({ ...file, createdAt: new Date(uploadedAt + index) })),
      },
    },
    include: messageInclude,
  });
  const message = toMessageDto(row);
  realtime.publishMessage(message);
  return message;
}

/**
 * Loads a live (not deleted) message of a channel the account can see. Whether the channel or the
 * message is missing, the answer is the same 404.
 */
async function findOwnableMessage(
  prisma: PrismaClient,
  account: Account,
  channelId: string,
  messageId: string,
) {
  if (!(await findAccessibleChannel(prisma, account, channelId))) {
    throw channelNotFound();
  }
  const row = await prisma.message.findFirst({
    where: { id: messageId, channelId, deletedAt: null },
    include: messageInclude,
  });
  if (!row) {
    throw new AppError(404, 'not_found', 'Message not found');
  }
  return row;
}

/**
 * The author rewrites their message. Only the author may do it: moderators delete messages (see
 * `deleteMessage`), they do not put words in other people's mouths.
 */
export async function editMessage(
  { prisma, realtime }: Deps,
  account: Account,
  channelId: string,
  messageId: string,
  content: string,
): Promise<MessageDto> {
  const current = await findOwnableMessage(prisma, account, channelId, messageId);
  if (current.userId !== account.id) {
    throw new AppError(403, 'forbidden', 'You can only edit your own messages');
  }
  if (content.trim() === '' && current.attachments.length === 0) {
    throw new AppError(400, 'invalid_request', 'content: must not be empty');
  }
  if (current.content === content) {
    return toMessageDto(current); // Nothing changed: no "edited" mark, nothing to broadcast.
  }
  const row = await prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    include: messageInclude,
  });
  const message = toMessageDto(row);
  realtime.publishMessageUpdated(message);
  return message;
}

/**
 * Soft delete: the message disappears for everyone, the row stays in the archive. The author may
 * delete their own message; someone with the right to moderate may delete the messages of anyone
 * they outrank (never those of an equal or a higher rank).
 */
export async function deleteMessage(
  { prisma, realtime }: Deps,
  account: Account,
  channelId: string,
  messageId: string,
): Promise<DeleteMessageResponse> {
  const current = await findOwnableMessage(prisma, account, channelId, messageId);
  if (current.userId !== account.id) {
    const authorRoles = [authorRole(current.user)];
    if (
      !hasPermission(account.roles, 'message.moderate') ||
      !outranks(account.roles, authorRoles)
    ) {
      throw new AppError(403, 'forbidden', 'You cannot delete this message');
    }
  }
  await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
  const result = { id: messageId, channelId };
  realtime.publishMessageDeleted(result);
  return result;
}

/**
 * Unread messages per channel for one account: what was written by someone else after the
 * channel's read marker. Without a marker, only messages posted since the account and the channel
 * both existed count, so a new account does not open on the whole history.
 */
export async function countUnread(
  prisma: PrismaClient,
  account: Account,
  channels: { id: string; createdAt: Date }[],
): Promise<Record<string, number>> {
  const markers = await prisma.channelRead.findMany({
    where: { userId: account.id, channelId: { in: channels.map((channel) => channel.id) } },
  });
  const readAt = new Map(markers.map((marker) => [marker.channelId, marker.lastReadAt]));
  const accountCreatedAt = new Date(account.createdAt);

  const counts = await Promise.all(
    channels.map(async (channel) => {
      const since =
        readAt.get(channel.id) ??
        (accountCreatedAt > channel.createdAt ? accountCreatedAt : channel.createdAt);
      const unread = await prisma.message.count({
        where: {
          channelId: channel.id,
          deletedAt: null,
          userId: { not: account.id },
          createdAt: { gt: since },
        },
      });
      return [channel.id, unread] as const;
    }),
  );
  return Object.fromEntries(counts.filter(([, unread]) => unread > 0));
}

/** Moves the channel's read marker forward to the given message. It never moves backwards. */
export async function markChannelRead(
  { prisma }: Pick<Deps, 'prisma'>,
  account: Account,
  channelId: string,
  messageId: string,
): Promise<MarkChannelReadResponse> {
  if (!(await findAccessibleChannel(prisma, account, channelId))) {
    throw channelNotFound();
  }
  // A deleted message is a valid position: the reader may have seen it before it vanished.
  const message = await prisma.message.findFirst({
    where: { id: messageId, channelId },
    select: { createdAt: true },
  });
  if (!message) {
    throw new AppError(404, 'not_found', 'Message not found');
  }
  const key = { userId_channelId: { userId: account.id, channelId } };
  const existing = await prisma.channelRead.findUnique({ where: key });
  if (existing && existing.lastReadAt >= message.createdAt) {
    return { channelId, lastReadAt: existing.lastReadAt.toISOString() };
  }
  const marker = await prisma.channelRead.upsert({
    where: key,
    create: { userId: account.id, channelId, lastReadAt: message.createdAt },
    update: { lastReadAt: message.createdAt },
  });
  return { channelId, lastReadAt: marker.lastReadAt.toISOString() };
}

/**
 * One page of history, newest page first (keyset pagination on `(created_at, id)`), returned
 * oldest message first so the client can display it as is.
 */
export async function listMessages(
  { prisma }: Pick<Deps, 'prisma'>,
  account: Account,
  channelId: string,
  options: { before?: string | undefined; limit?: number | undefined },
): Promise<MessagesPageResponse> {
  if (!(await findAccessibleChannel(prisma, account, channelId))) {
    throw channelNotFound();
  }
  const limit = options.limit ?? MESSAGES_PAGE_DEFAULT;

  let position: { createdAt: Date; id: string } | null = null;
  if (options.before) {
    // Soft-deleted messages stay valid cursors, so no `deletedAt` filter here.
    position = await prisma.message.findFirst({
      where: { id: options.before, channelId },
      select: { createdAt: true, id: true },
    });
    if (!position) {
      throw new AppError(400, 'invalid_request', 'Unknown "before" message for this channel');
    }
  }

  const rows = await prisma.message.findMany({
    where: {
      channelId,
      deletedAt: null,
      ...(position && {
        OR: [
          { createdAt: { lt: position.createdAt } },
          { createdAt: position.createdAt, id: { lt: position.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: messageInclude,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return {
    messages: page.map(toMessageDto),
    nextBefore: hasMore ? (page[0]?.id ?? null) : null,
  };
}

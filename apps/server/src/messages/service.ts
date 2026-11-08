import {
  MESSAGES_PAGE_DEFAULT,
  type MessageDto,
  type MessagesPageResponse,
} from '@percival/shared';
import { findAccessibleChannel } from '../channels/access.js';
import type { PrismaClient } from '../db.js';
import { AppError } from '../errors.js';
import type { Realtime } from '../realtime/hub.js';
import type { Account } from '../users/account.js';
import { messageInclude, toMessageDto } from './serialize.js';

interface Deps {
  prisma: PrismaClient;
  realtime: Realtime;
}

function channelNotFound(): AppError {
  // Same answer whether the channel does not exist or is not visible to the account.
  return new AppError(404, 'not_found', 'Channel not found');
}

/** Stores a message and pushes it to everyone who can see the channel. */
export async function postMessage(
  { prisma, realtime }: Deps,
  account: Account,
  channelId: string,
  content: string,
): Promise<MessageDto> {
  if (!(await findAccessibleChannel(prisma, account, channelId))) {
    throw channelNotFound();
  }
  const row = await prisma.message.create({
    data: { channelId, userId: account.id, content },
    include: messageInclude,
  });
  const message = toMessageDto(row);
  realtime.publishMessage(message);
  return message;
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

import type { MessageDto } from '@percival/shared';

/** Prisma `include` that loads what `toMessageDto` needs. */
export const messageInclude = {
  user: { select: { id: true, username: true, isBot: true } },
} as const;

export interface MessageWithAuthor {
  id: string;
  channelId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; username: string; isBot: boolean };
}

export function toMessageDto(message: MessageWithAuthor): MessageDto {
  return {
    id: message.id,
    channelId: message.channelId,
    author: {
      id: message.user.id,
      username: message.user.username,
      isBot: message.user.isBot,
    },
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}

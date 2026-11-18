import { isRoleName, topRole, type MessageDto } from '@percival/shared';
import type { Prisma } from '../generated/prisma/client.js';

/** Prisma `include` that loads what `toMessageDto` needs. */
export const messageInclude = {
  user: {
    select: {
      id: true,
      username: true,
      isBot: true,
      // The author's role tells a moderator whether they outrank them.
      roles: { select: { role: { select: { name: true } } } },
    },
  },
  // `createdAt` is set per file when the message is created, so it keeps the upload order.
  attachments: {
    select: { id: true, fileName: true, fileType: true, fileSize: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.MessageInclude;

export interface MessageWithAuthor {
  id: string;
  channelId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  user: {
    id: string;
    username: string;
    isBot: boolean;
    roles: { role: { name: string } }[];
  };
  attachments: { id: string; fileName: string; fileType: string; fileSize: number }[];
}

/** The author's highest role; an author without any (not expected) counts as the lowest. */
export function authorRole(user: MessageWithAuthor['user']): MessageDto['author']['role'] {
  const roles = user.roles.map((userRole) => userRole.role.name).filter(isRoleName);
  return topRole(roles) ?? (user.isBot ? 'bot' : 'guest');
}

export function toMessageDto(message: MessageWithAuthor): MessageDto {
  return {
    id: message.id,
    channelId: message.channelId,
    author: {
      id: message.user.id,
      username: message.user.username,
      isBot: message.user.isBot,
      role: authorRole(message.user),
    },
    content: message.content,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      fileType: attachment.fileType,
      fileSize: attachment.fileSize,
    })),
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
  };
}

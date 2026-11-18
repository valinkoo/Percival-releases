import type {
  ChannelMembersResponse,
  ChannelsResponse,
  CreateChannelResponse,
  DeleteMessageResponse,
  EditMessageResponse,
  MarkChannelReadResponse,
  MessagesPageResponse,
  SendMessageResponse,
  UpdateChannelResponse,
} from '@percival/shared';
import { MESSAGES_PAGE_DEFAULT, MESSAGES_PAGE_MAX, MESSAGE_MAX_LENGTH } from '@percival/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { removeUploads } from '../attachments/storage.js';
import { findAccessibleChannel, listAccessibleChannels } from '../channels/access.js';
import { addChannelMember, listChannelMembers, removeChannelMember } from '../channels/members.js';
import { toChannelDto } from '../channels/serialize.js';
import { channelDescriptionSchema, channelNameSchema } from '../channels/validation.js';
import { AppError } from '../errors.js';
import { readMessageForm } from '../messages/form.js';
import {
  channelNotFound,
  countUnread,
  deleteMessage,
  editMessage,
  listMessages,
  markChannelRead,
  postMessage,
} from '../messages/service.js';
import { requirePermission } from '../users/account.js';

const channelParamsSchema = z.object({ channelId: z.uuid() });
const messageParamsSchema = z.object({ channelId: z.uuid(), messageId: z.uuid() });

const memberParamsSchema = z.object({ channelId: z.uuid(), userId: z.uuid() });

const createChannelBodySchema = z.object({
  name: channelNameSchema,
  description: channelDescriptionSchema.optional(),
  isPrivate: z.boolean().optional(),
});

const updateChannelBodySchema = z
  .object({
    name: channelNameSchema.optional(),
    description: channelDescriptionSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.description !== undefined, {
    message: 'give at least one of "name" and "description"',
  });

/** Trailing blank space is noise; leading spaces can matter in Markdown (indented code). */
const messageText = z
  .string()
  .max(MESSAGE_MAX_LENGTH)
  .transform((value) => value.trimEnd());

/** A text-only message must have text. (With files, the text is optional: see the form route.) */
const sendBodySchema = z.object({
  content: messageText.refine((value) => value !== '', 'must not be empty'),
});

/**
 * Editing may leave the text empty: the service refuses it unless the message has files, which
 * then stand on their own.
 */
const editBodySchema = z.object({ content: messageText });

const markReadBodySchema = z.object({ messageId: z.uuid() });

const messagesQuerySchema = z.object({
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(MESSAGES_PAGE_MAX).default(MESSAGES_PAGE_DEFAULT),
});

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export const channelRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request): Promise<ChannelsResponse> => {
    const channels = await listAccessibleChannels(app.prisma, request.account);
    const unread = await countUnread(app.prisma, request.account, channels);
    return { channels: channels.map(toChannelDto), unread };
  });

  app.post('/', async (request, reply): Promise<CreateChannelResponse> => {
    reply.status(201);
    requirePermission(request.account, 'channel.create');
    const body = createChannelBodySchema.parse(request.body);
    const isPrivate = body.isPrivate ?? false;

    let channel;
    try {
      channel = await app.prisma.channel.create({
        data: {
          name: body.name,
          description: body.description ?? '',
          isPrivate,
          // A private channel is only visible to its members: its creator must be one.
          ...(isPrivate && { members: { create: { userId: request.account.id } } }),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'conflict', 'A channel with this name already exists');
      }
      throw error;
    }

    const dto = toChannelDto(channel);
    await app.realtime.publishChannel(dto, isPrivate ? [request.account.id] : []);
    return { channel: dto };
  });

  app.patch('/:channelId', async (request): Promise<UpdateChannelResponse> => {
    requirePermission(request.account, 'channel.rename');
    const { channelId } = channelParamsSchema.parse(request.params);
    const body = updateChannelBodySchema.parse(request.body);
    // Same answer for a missing channel and one the account cannot see.
    if (!(await findAccessibleChannel(app.prisma, request.account, channelId))) {
      throw channelNotFound();
    }

    let channel;
    try {
      channel = await app.prisma.channel.update({
        where: { id: channelId },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'conflict', 'A channel with this name already exists');
      }
      throw error;
    }

    const dto = toChannelDto(channel);
    app.realtime.publishChannelUpdated(dto);
    return { channel: dto };
  });

  app.get('/:channelId/members', async (request): Promise<ChannelMembersResponse> => {
    const { channelId } = channelParamsSchema.parse(request.params);
    return listChannelMembers(app, request.account, channelId);
  });

  app.put('/:channelId/members/:userId', async (request): Promise<ChannelMembersResponse> => {
    const { channelId, userId } = memberParamsSchema.parse(request.params);
    return addChannelMember(app, request.account, channelId, userId);
  });

  app.delete('/:channelId/members/:userId', async (request): Promise<ChannelMembersResponse> => {
    const { channelId, userId } = memberParamsSchema.parse(request.params);
    return removeChannelMember(app, request.account, channelId, userId);
  });

  app.get('/:channelId/messages', async (request): Promise<MessagesPageResponse> => {
    const { channelId } = channelParamsSchema.parse(request.params);
    const query = messagesQuerySchema.parse(request.query);
    return listMessages(app, request.account, channelId, query);
  });

  app.post(
    '/:channelId/messages',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply): Promise<SendMessageResponse> => {
      const { channelId } = channelParamsSchema.parse(request.params);

      if (!request.isMultipart()) {
        const { content } = sendBodySchema.parse(request.body);
        const message = await postMessage(app, request.account, channelId, content);
        reply.status(201);
        return { message };
      }

      // Message with files. Access is checked first: nothing is written for a channel the
      // account cannot see.
      if (!(await findAccessibleChannel(app.prisma, request.account, channelId))) {
        throw channelNotFound();
      }
      const form = await readMessageForm(request, app.config.UPLOADS_DIR);
      try {
        const message = await postMessage(
          app,
          request.account,
          channelId,
          form.content,
          form.files,
        );
        reply.status(201);
        return { message };
      } catch (error) {
        await removeUploads(app.config.UPLOADS_DIR, form.files);
        throw error;
      }
    },
  );

  app.patch(
    '/:channelId/messages/:messageId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request): Promise<EditMessageResponse> => {
      const { channelId, messageId } = messageParamsSchema.parse(request.params);
      const { content } = editBodySchema.parse(request.body);
      const message = await editMessage(app, request.account, channelId, messageId, content);
      return { message };
    },
  );

  app.delete(
    '/:channelId/messages/:messageId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request): Promise<DeleteMessageResponse> => {
      const { channelId, messageId } = messageParamsSchema.parse(request.params);
      return deleteMessage(app, request.account, channelId, messageId);
    },
  );

  app.post(
    '/:channelId/read',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request): Promise<MarkChannelReadResponse> => {
      const { channelId } = channelParamsSchema.parse(request.params);
      const { messageId } = markReadBodySchema.parse(request.body);
      return markChannelRead(app, request.account, channelId, messageId);
    },
  );
};

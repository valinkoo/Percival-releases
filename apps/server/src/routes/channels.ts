import type {
  ChannelsResponse,
  CreateChannelResponse,
  MessagesPageResponse,
  SendMessageResponse,
} from '@percival/shared';
import { MESSAGES_PAGE_DEFAULT, MESSAGES_PAGE_MAX, MESSAGE_MAX_LENGTH } from '@percival/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { listAccessibleChannels } from '../channels/access.js';
import { toChannelDto } from '../channels/serialize.js';
import { channelDescriptionSchema, channelNameSchema } from '../channels/validation.js';
import { AppError } from '../errors.js';
import { listMessages, postMessage } from '../messages/service.js';
import { isAdmin } from '../users/account.js';

const channelParamsSchema = z.object({ channelId: z.uuid() });

const createChannelBodySchema = z.object({
  name: channelNameSchema,
  description: channelDescriptionSchema.optional(),
});

const sendMessageBodySchema = z.object({
  content: z
    .string()
    .max(MESSAGE_MAX_LENGTH)
    .refine((value) => value.trim() !== '', 'must not be empty')
    // Trailing blank space is noise; leading spaces can matter in Markdown (indented code).
    .transform((value) => value.trimEnd()),
});

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
    return { channels: channels.map(toChannelDto) };
  });

  app.post('/', async (request, reply): Promise<CreateChannelResponse> => {
    reply.status(201);
    // Only administrators create channels for now; finer permissions come with the roles (v0.0.5).
    if (!isAdmin(request.account)) {
      throw new AppError(403, 'forbidden', 'Only administrators can create channels');
    }
    const body = createChannelBodySchema.parse(request.body);

    let channel;
    try {
      channel = await app.prisma.channel.create({
        data: { name: body.name, description: body.description ?? '' },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'conflict', 'A channel with this name already exists');
      }
      throw error;
    }

    const dto = toChannelDto(channel);
    await app.realtime.publishChannel(dto);
    return { channel: dto };
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
      const { content } = sendMessageBodySchema.parse(request.body);
      const message = await postMessage(app, request.account, channelId, content);
      reply.status(201);
      return { message };
    },
  );
};

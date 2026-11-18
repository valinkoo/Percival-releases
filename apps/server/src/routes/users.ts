import { HUMAN_ROLE_NAMES, type UserResponse, type UsersResponse } from '@percival/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createUser, listUsers, resetPassword, updateUser } from '../users/service.js';
import { newPasswordSchema, usernameSchema } from '../users/validation.js';

const userParamsSchema = z.object({ userId: z.uuid() });

const createBodySchema = z.object({
  username: usernameSchema,
  password: newPasswordSchema,
  role: z.enum(HUMAN_ROLE_NAMES),
});

const updateBodySchema = z
  .object({
    role: z.enum(HUMAN_ROLE_NAMES).optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => body.role !== undefined || body.active !== undefined, {
    message: 'give at least one of "role" and "active"',
  });

const resetPasswordBodySchema = z.object({ password: newPasswordSchema });

/**
 * Account administration. Who may do what (and to whom) is decided in `users/service.ts`, on the
 * server: the client only hides what it knows will be refused.
 */
export const userRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (request): Promise<UsersResponse> => ({
    users: await listUsers(app, request.account),
  }));

  app.post(
    '/',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply): Promise<UserResponse> => {
      const body = createBodySchema.parse(request.body);
      const user = await createUser(app, request.account, body);
      reply.status(201);
      return { user };
    },
  );

  app.patch(
    '/:userId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request): Promise<UserResponse> => {
      const { userId } = userParamsSchema.parse(request.params);
      const changes = updateBodySchema.parse(request.body);
      return { user: await updateUser(app, request.account, userId, changes) };
    },
  );

  app.post(
    '/:userId/password',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request): Promise<UserResponse> => {
      const { userId } = userParamsSchema.parse(request.params);
      const { password } = resetPasswordBodySchema.parse(request.body);
      return { user: await resetPassword(app, request.account, userId, password) };
    },
  );
};

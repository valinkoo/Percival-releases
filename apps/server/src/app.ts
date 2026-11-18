import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import {
  ATTACHMENTS_PER_MESSAGE_MAX,
  ATTACHMENT_MAX_BYTES,
  MESSAGE_MAX_LENGTH,
} from '@percival/shared';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import type { PrismaClient } from './db.js';
import { AppError, registerErrorHandling } from './errors.js';
import { createRealtime } from './realtime/hub.js';
import { attachmentRoutes } from './routes/attachments.js';
import { authRoutes } from './routes/auth.js';
import { channelRoutes } from './routes/channels.js';
import { healthRoutes } from './routes/health.js';
import { userRoutes } from './routes/users.js';
import { isRevoked, loadAccountState, type Account } from './users/account.js';

export interface AppDependencies {
  config: Config;
  prisma: PrismaClient;
}

export async function buildApp({ config, prisma }: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    // The API is only reachable through localhost / `tailscale serve`, which set X-Forwarded-For.
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  app.decorate('config', config);
  app.decorate('prisma', prisma);
  app.decorateRequest('account', null as unknown as Account);
  registerErrorHandling(app);

  await app.register(helmet);
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86_400,
  });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  // Messages with files (multipart/form-data). `bodyLimit` above only concerns JSON bodies: files
  // are streamed to disk and bounded here. Going over a limit is a 413 error.
  await app.register(multipart, {
    limits: {
      fileSize: ATTACHMENT_MAX_BYTES,
      files: ATTACHMENTS_PER_MESSAGE_MAX,
      fields: 5,
      parts: ATTACHMENTS_PER_MESSAGE_MAX + 5,
      headerPairs: 50,
      // In bytes, and a character takes up to 4 bytes in UTF-8.
      fieldSize: MESSAGE_MAX_LENGTH * 4,
    },
  });
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: config.JWT_EXPIRES_IN },
    verify: { algorithms: ['HS256'] },
  });

  /**
   * The token must be valid and issued after the account's last revocation, the account must
   * exist and be enabled. An account with a temporary password may only change it.
   */
  async function authenticateRequest(
    request: FastifyRequest,
    allowPasswordChange: boolean,
  ): Promise<void> {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError(401, 'unauthorized', 'Missing or invalid token');
    }
    const state = await loadAccountState(prisma, request.user.sub);
    if (!state) {
      throw new AppError(401, 'unauthorized', 'The account no longer exists');
    }
    if (state.disabled) {
      throw new AppError(403, 'account_disabled', 'This account has been disabled');
    }
    if (isRevoked(state, request.user.iat)) {
      throw new AppError(401, 'unauthorized', 'This session was closed');
    }
    if (state.account.mustChangePassword && !allowPasswordChange) {
      throw new AppError(403, 'password_change_required', 'The password must be changed first');
    }
    request.account = state.account;
  }

  app.decorate('authenticate', (request) => authenticateRequest(request, false));
  app.decorate('authenticateForPasswordChange', (request) => authenticateRequest(request, true));

  const realtime = createRealtime(app);
  app.decorate('realtime', realtime);
  app.addHook('onClose', async () => {
    await realtime.close();
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(channelRoutes, { prefix: '/api/channels' });
  await app.register(attachmentRoutes, { prefix: '/api/attachments' });
  await app.register(userRoutes, { prefix: '/api/users' });

  return app;
}

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import type { PrismaClient } from './db.js';
import { AppError, registerErrorHandling } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';

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
  registerErrorHandling(app);

  await app.register(helmet);
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86_400,
  });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: config.JWT_EXPIRES_IN },
    verify: { algorithms: ['HS256'] },
  });

  app.decorate('authenticate', async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError(401, 'unauthorized', 'Missing or invalid token');
    }
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });

  return app;
}

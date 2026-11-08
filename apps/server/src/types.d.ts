import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import type { PrismaClient } from './db.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    prisma: PrismaClient;
    /** preHandler/onRequest hook: rejects the request unless it carries a valid JWT. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string; iat: number; exp: number };
  }
}

import type { FastifyReply } from 'fastify';
import type { Config } from './config.js';
import type { PrismaClient } from './db.js';
import type { Realtime } from './realtime/hub.js';
import type { Account } from './users/account.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    prisma: PrismaClient;
    realtime: Realtime;
    /**
     * onRequest hook: rejects the request unless it carries a valid JWT of an existing, enabled
     * account whose password is not a temporary one, and sets `request.account`.
     */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * Same as `authenticate`, but accepts an account that must still change its temporary
     * password. Only the routes that serve that purpose use it.
     */
    authenticateForPasswordChange: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    /** The authenticated account. Only set after `app.authenticate` ran. */
    account: Account;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string; iat: number; exp: number };
  }
}

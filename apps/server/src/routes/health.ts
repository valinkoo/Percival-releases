import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // Liveness + database reachability. Used by docker and by the client's "server" check.
  // `logLevel: 'warn'` keeps the docker healthcheck (every 15 s) out of the request logs.
  app.get(
    '/health',
    { logLevel: 'warn', config: { rateLimit: false } },
    async (_request, reply) => {
      try {
        await app.prisma.$queryRaw`SELECT 1`;
        return { status: 'ok' };
      } catch (error) {
        app.log.error({ err: error }, 'Health check: database unreachable');
        return reply.status(503).send({ status: 'degraded' });
      }
    },
  );
};

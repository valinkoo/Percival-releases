import { PASSWORD_MAX_LENGTH, type LoginResponse, type MeResponse } from '@percival/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { verifyPassword } from '../security/password.js';
import { toUserDto, userInclude } from '../users/serialize.js';

// Login deliberately skips the password policy: it only checks that something was sent.
const loginBodySchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/login',
    // Brute-force protection, per client IP.
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply): Promise<LoginResponse> => {
      const { username, password } = loginBodySchema.parse(request.body);

      const user = await app.prisma.user.findUnique({
        where: { username },
        include: userInclude,
      });

      // Bots authenticate with access tokens, never with a password.
      const passwordHash = user && !user.isBot ? user.passwordHash : null;
      const passwordOk = await verifyPassword(passwordHash, password);
      if (!user || !passwordOk) {
        request.log.info({ username }, 'Failed login');
        throw new AppError(401, 'invalid_credentials', 'Invalid username or password');
      }

      const token = await reply.jwtSign({ sub: user.id });
      const decoded = app.jwt.decode<{ exp: number }>(token);
      if (!decoded) {
        throw new Error('Freshly signed JWT could not be decoded');
      }

      return {
        token,
        expiresAt: new Date(decoded.exp * 1000).toISOString(),
        user: toUserDto(user),
      };
    },
  );

  // Returns the current user. The client uses it to check that a stored token is still valid.
  app.get('/me', { onRequest: [app.authenticate] }, async (request): Promise<MeResponse> => ({
    user: request.account,
  }));
};

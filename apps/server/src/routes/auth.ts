import { PASSWORD_MAX_LENGTH, type LoginResponse, type MeResponse } from '@percival/shared';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { toUserDto, userInclude, type UserWithRoles } from '../users/serialize.js';
import { newPasswordSchema } from '../users/validation.js';

// Login deliberately skips the password policy: it only checks that something was sent.
const loginBodySchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: newPasswordSchema,
});

/** Signs a fresh token for a user and builds the answer shared by login and password change. */
async function sessionFor(
  app: FastifyInstance,
  reply: FastifyReply,
  user: UserWithRoles,
): Promise<LoginResponse> {
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
}

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
      // Said only to someone who knows the password, so it does not reveal which names exist.
      if (user.disabledAt) {
        request.log.info({ username }, 'Login refused: account disabled');
        throw new AppError(403, 'account_disabled', 'This account has been disabled');
      }

      return sessionFor(app, reply, user);
    },
  );

  // Returns the current user. The client uses it to check that a stored token is still valid.
  // It also answers for an account that must change its temporary password: that is how the
  // client learns it has to ask for a new one.
  app.get(
    '/me',
    { onRequest: [app.authenticateForPasswordChange] },
    async (request): Promise<MeResponse> => ({ user: request.account }),
  );

  // The person chooses their own password. Every other session of the account is closed; the
  // answer carries the token to continue with.
  app.post(
    '/password',
    {
      onRequest: [app.authenticateForPasswordChange],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply): Promise<LoginResponse> => {
      const { currentPassword, newPassword } = changePasswordBodySchema.parse(request.body);

      const current = await app.prisma.user.findUniqueOrThrow({
        where: { id: request.account.id },
      });
      if (!(await verifyPassword(current.passwordHash, currentPassword))) {
        // 403, not 401: a wrong password here must not look like an expired session.
        throw new AppError(403, 'invalid_credentials', 'The current password is incorrect');
      }
      if (newPassword === currentPassword) {
        throw new AppError(
          400,
          'invalid_request',
          'newPassword: must differ from the current password',
        );
      }

      const revokedBefore = new Date();
      const user = await app.prisma.user.update({
        where: { id: current.id },
        data: {
          passwordHash: await hashPassword(newPassword),
          mustChangePassword: false,
          sessionsRevokedBefore: revokedBefore,
        },
        include: userInclude,
      });
      app.realtime.closeSessionsBefore(user.id, revokedBefore);
      return sessionFor(app, reply, user);
    },
  );
};

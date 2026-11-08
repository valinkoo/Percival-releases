import type { ApiErrorBody, ErrorCode } from '@percival/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/** An error that is safe to show to the client: it carries its HTTP status and API code. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function body(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 429:
      return 'rate_limited';
    default:
      return 'invalid_request';
  }
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send(body('not_found', 'Route not found'));
  });

  app.setErrorHandler((error: FastifyError | AppError | ZodError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(body(error.code, error.message));
    }

    if (error instanceof ZodError) {
      const message = error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
      return reply.status(400).send(body('invalid_request', message));
    }

    // Errors raised by Fastify and its plugins (malformed JSON, payload too large, rate limit...)
    const status = 'statusCode' in error ? error.statusCode : undefined;
    if (status !== undefined && status >= 400 && status < 500) {
      return reply.status(status).send(body(codeForStatus(status), error.message));
    }

    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send(body('internal_error', 'Internal server error'));
  });
}

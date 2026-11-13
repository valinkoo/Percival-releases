import { z } from 'zod';

/** Empty strings (e.g. `ADMIN_USERNAME=` in .env) are treated as "not set". */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? undefined : value));

// Origins of the Tauri WebView (production build on Windows, then `tauri dev`).
const DEFAULT_CORS_ORIGINS = [
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
  'http://localhost:1420',
];

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  /** Where uploaded files are stored (a Docker volume in production). */
  UPLOADS_DIR: z.string().min(1).default('./uploads'),
  CORS_ORIGINS: optionalString.transform((value) =>
    value === undefined
      ? DEFAULT_CORS_ORIGINS
      : value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
  ),
  ADMIN_USERNAME: optionalString,
  ADMIN_PASSWORD: optionalString,
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid server configuration:\n${details}`);
  }
  return result.data;
}

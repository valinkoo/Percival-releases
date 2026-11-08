import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer loads .env on its own. The single .env lives at the repository root
// and is shared with docker compose. Variables already set in the environment win.
const rootEnvFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});

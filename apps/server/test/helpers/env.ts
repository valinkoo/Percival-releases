import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TEST_DATABASE_NAME = 'percival_test';

/** Loads the repository's `.env` (never overriding variables that are already set). */
export function loadRootEnv(): void {
  const file = fileURLToPath(new URL('../../../../.env', import.meta.url));
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

/**
 * URL of the throwaway database used by the tests: `TEST_DATABASE_URL`, or `DATABASE_URL` with
 * the database name replaced. The name must end with `_test`: the tests wipe the database.
 */
export function testDatabaseUrl(): string {
  loadRootEnv();
  const explicit = process.env['TEST_DATABASE_URL'];
  const base = explicit ?? process.env['DATABASE_URL'];
  if (!base) {
    throw new Error('Set DATABASE_URL (see .env.example) or TEST_DATABASE_URL to run the tests.');
  }
  const url = new URL(base);
  if (!explicit) {
    url.pathname = `/${TEST_DATABASE_NAME}`;
  }
  if (!url.pathname.slice(1).endsWith('_test')) {
    throw new Error('Refusing to run the tests on a database whose name does not end with _test.');
  }
  return url.toString();
}

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { testDatabaseUrl } from './helpers/env.js';

/** Recreates the test database and applies every migration, once before all test files. */
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const databaseName = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }

  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve('prisma/build/index.js');
  const serverDir = fileURLToPath(new URL('..', import.meta.url));
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}

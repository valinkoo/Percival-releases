import { buildApp } from './app.js';
import { createFirstAdmin, ensureDefaultChannel, ensureRoles } from './bootstrap.js';
import { loadConfig } from './config.js';
import { createPrismaClient } from './db.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = createPrismaClient(config.DATABASE_URL);
  const app = await buildApp({ config, prisma });

  await ensureRoles(prisma);
  await ensureDefaultChannel(prisma);

  // Optional bootstrap of the first administrator (see .env.example).
  if (config.ADMIN_USERNAME && config.ADMIN_PASSWORD) {
    const result = await createFirstAdmin(prisma, {
      username: config.ADMIN_USERNAME,
      password: config.ADMIN_PASSWORD,
    });
    if (result.status === 'created') {
      app.log.info(
        { username: result.username },
        'First administrator created. Remove ADMIN_USERNAME and ADMIN_PASSWORD from .env.',
      );
    }
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Shutting down');
    try {
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

/**
 * Creates the first administrator.
 *
 *   pnpm --filter @percival/server create-admin [username]
 *   docker compose run --rm api node dist/scripts/create-admin.js [username]
 *
 * The username comes from the argument, then ADMIN_USERNAME, then a prompt.
 * The password comes from ADMIN_PASSWORD, then a hidden prompt (asked twice).
 * Does nothing if an administrator already exists.
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { createFirstAdmin, ensureRoles } from '../bootstrap.js';
import { loadConfig } from '../config.js';
import { createPrismaClient } from '../db.js';

/** One readline interface for the whole run, so piped input is not lost between questions. */
function createPrompter() {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({
    input: process.stdin,
    output,
    terminal: Boolean(process.stdin.isTTY),
  });
  // Created right away so that lines read from a pipe are buffered even before they are asked for.
  const lines = rl[Symbol.asyncIterator]();
  // Piped input reaches end-of-file immediately, which closes the interface early.
  let closed = false;
  rl.once('close', () => {
    closed = true;
  });

  return {
    async ask(question: string, options: { hidden: boolean }): Promise<string> {
      if (closed) {
        process.stdout.write(question);
      } else {
        rl.setPrompt(question);
        rl.prompt();
      }
      // The question is printed: from now on, hide what is typed.
      muted = options.hidden;
      try {
        const next = await lines.next();
        if (next.done) {
          throw new Error('Input closed before an answer was given.');
        }
        return next.value;
      } finally {
        muted = false;
        if (options.hidden) process.stdout.write('\n');
      }
    },
    close(): void {
      rl.close();
    },
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = createPrismaClient(config.DATABASE_URL);
  const prompter = createPrompter();

  try {
    await ensureRoles(prisma);

    const username =
      process.argv[2] ??
      config.ADMIN_USERNAME ??
      (await prompter.ask('Username: ', { hidden: false }));

    let password = config.ADMIN_PASSWORD;
    if (!password) {
      password = await prompter.ask('Password: ', { hidden: true });
      const confirmation = await prompter.ask('Confirm password: ', { hidden: true });
      if (password !== confirmation) {
        throw new Error('The two passwords do not match.');
      }
    }

    const result = await createFirstAdmin(prisma, { username, password });
    if (result.status === 'created') {
      console.log(`Administrator "${result.username}" created.`);
    } else {
      console.log('An administrator already exists. Nothing was changed.');
    }
  } finally {
    prompter.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

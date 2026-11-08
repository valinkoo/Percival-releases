import argon2 from 'argon2';

// argon2id with the library defaults (64 MiB, 3 passes), which follow the OWASP baseline.
const ARGON2_OPTIONS = { type: argon2.argon2id } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password. When there is no hash to check (unknown user, bot account), a dummy hash
 * is verified instead so that the response time does not reveal whether the account exists.
 */
export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (hash === null) {
    dummyHash ??= hashPassword('percival-timing-equalizer');
    await argon2.verify(await dummyHash, password);
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Malformed hash in the database: treat as a failed login rather than a server error.
    return false;
  }
}

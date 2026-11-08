/**
 * Global roles (see docs/DAT.md, "Amendements"). The identifiers are stable and stored in the
 * database; the French display labels live in the client.
 */
export const ROLE_NAMES = ['admin', 'member', 'guest', 'bot'] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === 'string' && (ROLE_NAMES as readonly string[]).includes(value);
}

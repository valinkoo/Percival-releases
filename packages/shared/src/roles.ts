/**
 * Global roles (see docs/DAT.md, "Amendements"). The identifiers are stable and stored in the
 * database; the French display labels live in the client.
 *
 * Hierarchy: admin > moderator ("Modo") > member > guest. The bot role is outside it: it has no
 * permission, and anyone allowed to moderate can moderate a bot's messages.
 *
 * These rules are shared so the client can hide what a user may not do, but the server is the
 * one that enforces them: hiding a button protects nothing.
 */
export const ROLE_NAMES = ['admin', 'moderator', 'member', 'guest', 'bot'] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export function isRoleName(value: unknown): value is RoleName {
  return typeof value === 'string' && (ROLE_NAMES as readonly string[]).includes(value);
}

/** Roles of people (everything but the bot), from the highest rank to the lowest. */
export const HUMAN_ROLE_NAMES = ['admin', 'moderator', 'member', 'guest'] as const;

export type HumanRoleName = (typeof HUMAN_ROLE_NAMES)[number];

export function isHumanRoleName(value: unknown): value is HumanRoleName {
  return typeof value === 'string' && (HUMAN_ROLE_NAMES as readonly string[]).includes(value);
}

/** Higher outranks lower. Gaps leave room for a future role between two existing ones. */
export const ROLE_RANK: Readonly<Record<RoleName, number>> = {
  admin: 40,
  moderator: 30,
  member: 20,
  guest: 10,
  bot: 0,
};

export const PERMISSIONS = [
  'channel.create',
  'channel.rename',
  /** Add and remove the members of a channel (and so assign guests to it). */
  'channel.members',
  /** Delete the messages of someone of a lower rank. */
  'message.moderate',
  'user.list',
  'user.create',
  /** Disable, re-enable and reset the password of someone of a lower rank. */
  'user.manage',
  'user.role',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MODERATOR_PERMISSIONS: readonly Permission[] = [
  'channel.create',
  'channel.rename',
  'channel.members',
  'message.moderate',
  'user.list',
  'user.create',
  'user.manage',
];

export const ROLE_PERMISSIONS: Readonly<Record<RoleName, readonly Permission[]>> = {
  admin: PERMISSIONS,
  // Everything but changing roles. Deleting channels, bots, tokens, webhooks and the server
  // settings are not permissions a moderator can ever get.
  moderator: MODERATOR_PERMISSIONS,
  member: [],
  guest: [],
  bot: [],
};

/** The highest rank among the roles; -1 when there is none, which outranks nobody. */
export function rankOf(roles: readonly RoleName[]): number {
  return roles.reduce((best, role) => Math.max(best, ROLE_RANK[role]), -1);
}

/** The role with the highest rank, or `null` for an account without any role. */
export function topRole(roles: readonly RoleName[]): RoleName | null {
  let best: RoleName | null = null;
  for (const role of roles) {
    if (best === null || ROLE_RANK[role] > ROLE_RANK[best]) best = role;
  }
  return best;
}

export function hasPermission(roles: readonly RoleName[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}

/** Acting on someone (or on their messages) needs a strictly higher rank than theirs. */
export function outranks(actor: readonly RoleName[], target: readonly RoleName[]): boolean {
  return rankOf(actor) > rankOf(target);
}

/** The roles one may give to an account: people's roles strictly below one's own rank. */
export function assignableRoles(actor: readonly RoleName[]): HumanRoleName[] {
  const rank = rankOf(actor);
  return HUMAN_ROLE_NAMES.filter((role) => ROLE_RANK[role] < rank);
}

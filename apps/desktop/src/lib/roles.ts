import { hasPermission, type Permission, type RoleName } from '@percival/shared';

/** French display labels for the global roles. */
export const ROLE_LABELS: Record<RoleName, string> = {
  admin: 'Administrateur',
  moderator: 'Modo',
  member: 'Membre',
  guest: 'Invité',
  bot: 'Bot',
};

/**
 * Whether the roles grant a permission. The server decides for real; this only decides what the
 * interface offers, so a button is never shown for something that will be refused.
 */
export function can(roles: readonly RoleName[] | undefined, permission: Permission): boolean {
  return hasPermission(roles ?? [], permission);
}

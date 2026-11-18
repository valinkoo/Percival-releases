import {
  isRoleName,
  topRole,
  type ManagedUserDto,
  type RoleName,
  type UserDto,
} from '@percival/shared';

/** Prisma `include` that loads what `toUserDto` needs. */
export const userInclude = {
  roles: { include: { role: { select: { name: true } } } },
} as const;

export interface UserWithRoles {
  id: string;
  username: string;
  isBot: boolean;
  mustChangePassword: boolean;
  disabledAt: Date | null;
  createdAt: Date;
  roles: { role: { name: string } }[];
}

export function roleNamesOf(user: Pick<UserWithRoles, 'roles'>): RoleName[] {
  return user.roles.map((userRole) => userRole.role.name).filter(isRoleName);
}

/** Public representation of a user. Never exposes the password hash. */
export function toUserDto(user: UserWithRoles): UserDto {
  return {
    id: user.id,
    username: user.username,
    isBot: user.isBot,
    roles: roleNamesOf(user),
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}

/** An account as the administration screen lists it. */
export function toManagedUserDto(user: UserWithRoles): ManagedUserDto {
  return {
    id: user.id,
    username: user.username,
    // An account without a role cannot happen through the API; it is shown as the lowest one.
    role: topRole(roleNamesOf(user)) ?? 'guest',
    active: user.disabledAt === null,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}

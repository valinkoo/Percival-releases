import { isRoleName, type UserDto } from '@percival/shared';

/** Prisma `include` that loads what `toUserDto` needs. */
export const userInclude = {
  roles: { include: { role: { select: { name: true } } } },
} as const;

export interface UserWithRoles {
  id: string;
  username: string;
  isBot: boolean;
  createdAt: Date;
  roles: { role: { name: string } }[];
}

/** Public representation of a user. Never exposes the password hash. */
export function toUserDto(user: UserWithRoles): UserDto {
  return {
    id: user.id,
    username: user.username,
    isBot: user.isBot,
    roles: user.roles.map((userRole) => userRole.role.name).filter(isRoleName),
    createdAt: user.createdAt.toISOString(),
  };
}

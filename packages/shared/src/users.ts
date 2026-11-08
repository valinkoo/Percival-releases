import type { RoleName } from './roles.js';

/** A user as exposed by the API. Never contains the password hash. */
export interface UserDto {
  id: string;
  username: string;
  isBot: boolean;
  roles: RoleName[];
  /** ISO 8601 timestamp. */
  createdAt: string;
}

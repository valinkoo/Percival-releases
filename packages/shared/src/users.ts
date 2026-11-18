import type { HumanRoleName, RoleName } from './roles.js';

/** A user as exposed by the API. Never contains the password hash. */
export interface UserDto {
  id: string;
  username: string;
  isBot: boolean;
  roles: RoleName[];
  /**
   * The account has a temporary password (just created, or reset): the server refuses everything
   * but a password change until the person has chosen their own.
   */
  mustChangePassword: boolean;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** A person's account as the administration screen lists it. */
export interface ManagedUserDto {
  id: string;
  username: string;
  role: RoleName;
  /** `false` for a disabled account: it cannot sign in and its sessions are closed. */
  active: boolean;
  mustChangePassword: boolean;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface UsersResponse {
  /**
   * Accounts the caller may see: everyone for an admin, only the ranks below their own for anyone
   * else with the right to list accounts.
   */
  users: ManagedUserDto[];
}

export interface CreateUserRequest {
  username: string;
  /** Temporary password: the person must change it at their first sign-in. */
  password: string;
  /** A role strictly below the caller's rank. */
  role: HumanRoleName;
}

export interface UserResponse {
  user: ManagedUserDto;
}

/** At least one field. `role` is reserved to admins; `active: false` disables the account. */
export interface UpdateUserRequest {
  role?: HumanRoleName;
  active?: boolean;
}

/** Gives the account a new temporary password: the person must change it at next sign-in. */
export interface ResetPasswordRequest {
  password: string;
}

import type { UserDto } from './users.js';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  /** JWT to send as `Authorization: Bearer <token>`. */
  token: string;
  /** ISO 8601 expiry of the token. */
  expiresAt: string;
  user: UserDto;
}

export interface MeResponse {
  user: UserDto;
}

/**
 * Chooses one's own password. The answer is a `LoginResponse`: the other sessions of the account
 * are closed, so the caller continues with the fresh token it carries.
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

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

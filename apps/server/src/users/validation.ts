import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@percival/shared';
import { z } from 'zod';

/** Usernames are case-insensitive: they are trimmed and stored in lowercase. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(USERNAME_PATTERN, 'only letters, digits, ".", "_" and "-" are allowed');

/** Policy for new passwords. Login does not apply it, so a policy change locks nobody out. */
export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

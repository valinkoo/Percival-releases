/** Validation limits shared by the API (authoritative) and the client (early feedback). */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
/** Usernames are lowercase: letters, digits, dot, underscore and dash. */
export const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

export const CHANNEL_NAME_MAX_LENGTH = 40;
export const CHANNEL_DESCRIPTION_MAX_LENGTH = 200;

export const MESSAGE_MAX_LENGTH = 4000;
export const MESSAGES_PAGE_DEFAULT = 50;
export const MESSAGES_PAGE_MAX = 100;

export const PASSWORD_MIN_LENGTH = 10;
/** Upper bound that keeps argon2 from being used as a CPU denial of service. */
export const PASSWORD_MAX_LENGTH = 128;

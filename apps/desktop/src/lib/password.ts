import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@percival/shared';

/**
 * Early feedback on a new password, with the server's rules (which stay authoritative). Returns a
 * French message, or `null` when the password can be sent. `current` is the password being
 * replaced, when there is one: the new one must differ from it.
 */
export function checkNewPassword(
  newPassword: string,
  confirmation: string,
  current?: string,
): string | null {
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return `Le nouveau mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }
  if (newPassword.length > PASSWORD_MAX_LENGTH) {
    return `Le nouveau mot de passe doit faire au plus ${PASSWORD_MAX_LENGTH} caractères.`;
  }
  if (current !== undefined && newPassword === current) {
    return "Le nouveau mot de passe doit être différent de l'ancien.";
  }
  if (newPassword !== confirmation) {
    return 'Les deux mots de passe ne correspondent pas.';
  }
  return null;
}

/** Early feedback on the temporary password an administrator gives to someone else. */
export function checkTemporaryPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe provisoire doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Le mot de passe provisoire doit faire au plus ${PASSWORD_MAX_LENGTH} caractères.`;
  }
  return null;
}

/** Early feedback on a username (the server trims and lowercases it, so the same is done here). */
export function checkUsername(raw: string): string | null {
  const username = raw.trim().toLowerCase();
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return `Le nom d'utilisateur doit faire entre ${USERNAME_MIN_LENGTH} et ${USERNAME_MAX_LENGTH} caractères.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return "Le nom d'utilisateur ne peut contenir que des lettres, des chiffres, « . », « _ » et « - ».";
  }
  return null;
}

/** Without the characters that are easy to mix up when read aloud or copied by hand (0 O 1 l I). */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/**
 * A random password for an administrator to hand over as a temporary one. Drawn from the browser's
 * cryptographic generator; values that would favour some characters are thrown away.
 */
export function generatePassword(length = 20): string {
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    throw new RangeError('The length must stay within the password policy');
  }
  // The largest multiple of the alphabet size that fits in a byte: bytes above it are rejected.
  const limit = Math.floor(256 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length;
  let password = '';
  while (password.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < limit && password.length < length) {
        password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
      }
    }
  }
  return password;
}

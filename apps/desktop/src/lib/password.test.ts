import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@percival/shared';
import { describe, expect, it } from 'vitest';
import {
  checkNewPassword,
  checkTemporaryPassword,
  checkUsername,
  generatePassword,
} from './password';

describe('checkNewPassword', () => {
  const good = 'Un-Bon-Mot-De-Passe-1';

  it('accepts a long enough password that differs from the current one and is confirmed', () => {
    expect(checkNewPassword(good, good, 'ancien-mot-de-passe')).toBeNull();
    expect(checkNewPassword(good, good)).toBeNull();
  });

  it('refuses a password that is too short or too long', () => {
    const short = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);
    expect(checkNewPassword(short, short)).toMatch(/au moins/);
    const long = 'a'.repeat(PASSWORD_MAX_LENGTH + 1);
    expect(checkNewPassword(long, long)).toMatch(/au plus/);
  });

  it('refuses the current password again', () => {
    expect(checkNewPassword(good, good, good)).toMatch(/différent/);
  });

  it('refuses a confirmation that does not match', () => {
    expect(checkNewPassword(good, `${good}x`)).toMatch(/ne correspondent pas/);
  });
});

describe('checkTemporaryPassword', () => {
  it('applies the length rules of the server', () => {
    expect(checkTemporaryPassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(checkTemporaryPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toMatch(/au moins/);
    expect(checkTemporaryPassword('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toMatch(/au plus/);
  });
});

describe('checkUsername', () => {
  it('accepts what the server accepts, whatever the case or the surrounding spaces', () => {
    expect(checkUsername('alice')).toBeNull();
    expect(checkUsername('  Alice.B_c-1  ')).toBeNull();
  });

  it('refuses names that are too short, too long or use other characters', () => {
    expect(checkUsername('a'.repeat(USERNAME_MIN_LENGTH - 1))).toMatch(/entre/);
    expect(checkUsername('a'.repeat(USERNAME_MAX_LENGTH + 1))).toMatch(/entre/);
    expect(checkUsername('has space')).toMatch(/lettres/);
    expect(checkUsername('accentué')).toMatch(/lettres/);
  });
});

describe('generatePassword', () => {
  it('produces a password of the asked length that passes the policy', () => {
    expect(generatePassword()).toHaveLength(20);
    expect(generatePassword(PASSWORD_MIN_LENGTH)).toHaveLength(PASSWORD_MIN_LENGTH);
    expect(generatePassword(PASSWORD_MAX_LENGTH)).toHaveLength(PASSWORD_MAX_LENGTH);
    expect(checkTemporaryPassword(generatePassword())).toBeNull();
  });

  it('avoids the characters that are easy to mix up', () => {
    for (let round = 0; round < 50; round++) {
      expect(generatePassword(PASSWORD_MAX_LENGTH)).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
    }
  });

  it('draws a different password each time', () => {
    const passwords = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(passwords.size).toBe(50);
  });

  it('refuses a length the policy would reject', () => {
    expect(() => generatePassword(PASSWORD_MIN_LENGTH - 1)).toThrow(RangeError);
    expect(() => generatePassword(PASSWORD_MAX_LENGTH + 1)).toThrow(RangeError);
  });
});

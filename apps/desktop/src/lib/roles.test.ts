import { ROLE_NAMES } from '@percival/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { errorMessage } from './messages';
import { ROLE_LABELS, can } from './roles';

describe('role labels', () => {
  it('has a French label for every role, the moderator being « Modo »', () => {
    for (const role of ROLE_NAMES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
    expect(ROLE_LABELS.moderator).toBe('Modo');
  });
});

describe('can', () => {
  it('follows the shared permission table', () => {
    expect(can(['admin'], 'user.role')).toBe(true);
    expect(can(['moderator'], 'user.role')).toBe(false);
    expect(can(['moderator'], 'channel.create')).toBe(true);
    expect(can(['member'], 'channel.create')).toBe(false);
    expect(can(['guest'], 'user.list')).toBe(false);
  });

  it('grants nothing to a user that is not loaded yet', () => {
    expect(can(undefined, 'channel.create')).toBe(false);
  });
});

describe('errorMessage overrides', () => {
  it('says what a conflict means in the context of the call', () => {
    const conflict = new ApiError('conflict', 409);
    expect(errorMessage(conflict)).toBe('Un salon porte déjà ce nom.');
    expect(errorMessage(conflict, { conflict: "Ce nom d'utilisateur est déjà pris." })).toBe(
      "Ce nom d'utilisateur est déjà pris.",
    );
  });

  it('keeps the default message for the codes that are not overridden', () => {
    const forbidden = new ApiError('forbidden', 403);
    expect(errorMessage(forbidden, { conflict: 'autre' })).toBe(errorMessage(forbidden));
  });

  it('has a message for a disabled account and a temporary password', () => {
    expect(errorMessage(new ApiError('account_disabled', 403))).toMatch(/désactivé/);
    expect(errorMessage(new ApiError('password_change_required', 403))).toMatch(/mot de passe/);
  });
});

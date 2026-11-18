import type { LoginResponse, UserDto } from '@percival/shared';
import {
  ApiError,
  changePassword,
  fetchMe,
  login,
  onUnauthorized,
  type SessionEndReason,
} from './api';
import { errorMessage } from './messages';
import { parseServerUrl } from './server-url';
import { deleteToken, loadServerUrl, loadToken, saveServerUrl, saveToken } from './storage';

export type SessionStatus = 'starting' | 'signedOut' | 'signedIn';

class Session {
  status = $state<SessionStatus>('starting');
  serverUrl = $state('');
  user = $state<UserDto | null>(null);
  /** Message shown on the login screen (expired session, unreachable server...). */
  notice = $state<string | null>(null);

  /** JWT, kept in memory only. Persisted in the Windows Credential Manager (see storage.ts). */
  #token: string | null = null;

  get token(): string | null {
    return this.#token;
  }

  /** Called once at startup: resumes the stored session if the server still accepts it. */
  async restore(): Promise<void> {
    const storedUrl = loadServerUrl();
    if (storedUrl) this.serverUrl = storedUrl;

    let token: string | null = null;
    if (storedUrl) {
      try {
        token = await loadToken();
      } catch {
        token = null;
      }
    }
    if (!storedUrl || !token) {
      this.status = 'signedOut';
      return;
    }

    try {
      const { user } = await fetchMe(storedUrl, token);
      this.#token = token;
      this.user = user;
      this.status = 'signedIn';
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthorized') {
        await this.#forgetToken();
      }
      this.notice = errorMessage(error);
      this.status = 'signedOut';
    }
  }

  /** Returns a French error message, or `null` when the user is signed in. */
  async signIn(serverInput: string, username: string, password: string): Promise<string | null> {
    const parsed = parseServerUrl(serverInput);
    if (!parsed.ok) return parsed.message;

    let response: LoginResponse;
    try {
      response = await login(parsed.url, { username: username.trim(), password });
    } catch (error) {
      return errorMessage(error);
    }

    this.serverUrl = parsed.url;
    saveServerUrl(parsed.url);
    this.#token = response.token;
    this.user = response.user;
    this.notice = null;
    this.status = 'signedIn';

    try {
      await saveToken(response.token);
    } catch {
      this.notice =
        'Impossible de mémoriser la session : vous devrez vous reconnecter au prochain lancement.';
    }
    return null;
  }

  /** The server refused the token: back to the login screen, with an explanation. */
  async expire(reason: SessionEndReason = 'expired'): Promise<void> {
    if (this.status !== 'signedIn') return;
    await this.signOut();
    this.notice =
      reason === 'disabled'
        ? 'Ce compte a été désactivé par un administrateur.'
        : 'Votre session a expiré. Reconnectez-vous.';
  }

  /** The server says something changed about the signed-in account (its role, for instance). */
  setUser(user: UserDto): void {
    if (this.status === 'signedIn') this.user = user;
  }

  /**
   * The person chooses their own password. The server closes the other sessions and hands back a
   * fresh token, which replaces the current one. Returns a French error message, or `null`.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<string | null> {
    const token = this.#token;
    if (!token) return errorMessage(null);

    let response: LoginResponse;
    try {
      response = await changePassword(this.serverUrl, token, { currentPassword, newPassword });
    } catch (error) {
      return errorMessage(error, { invalid_credentials: 'Le mot de passe actuel est incorrect.' });
    }

    this.#token = response.token;
    this.user = response.user;
    try {
      await saveToken(response.token);
    } catch {
      this.notice =
        'Impossible de mémoriser la session : vous devrez vous reconnecter au prochain lancement.';
    }
    return null;
  }

  async signOut(): Promise<void> {
    this.#token = null;
    this.user = null;
    this.notice = null;
    await this.#forgetToken();
    this.status = 'signedOut';
  }

  async #forgetToken(): Promise<void> {
    try {
      await deleteToken();
    } catch {
      // Nothing to delete, or the credential store is unavailable.
    }
  }
}

export const session = new Session();

// Any authenticated request rejected with "unauthorized" (or for a disabled account) ends the session.
onUnauthorized((reason) => void session.expire(reason));

import type { LoginResponse, UserDto } from '@percival/shared';
import { ApiError, fetchMe, login } from './api';
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

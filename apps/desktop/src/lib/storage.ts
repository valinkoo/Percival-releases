/**
 * Persistence.
 *
 * - The server address is not secret: it lives in localStorage.
 * - The session token is kept out of the WebView's storage. In the app it goes to the Windows
 *   Credential Manager through Rust commands (see src-tauri/src/lib.rs).
 *
 * When the frontend runs in a plain browser (`pnpm --filter @percival/desktop dev`, without
 * Tauri), the token falls back to sessionStorage so the UI can still be developed.
 */
import { invoke } from '@tauri-apps/api/core';
import { inTauri } from './tauri';

const SERVER_URL_KEY = 'percival.serverUrl';
const DEV_TOKEN_KEY = 'percival.devToken';

export function loadServerUrl(): string | null {
  try {
    return localStorage.getItem(SERVER_URL_KEY);
  } catch {
    return null;
  }
}

export function saveServerUrl(url: string): void {
  try {
    localStorage.setItem(SERVER_URL_KEY, url);
  } catch {
    // Storage unavailable: the address will simply be asked again next time.
  }
}

export async function loadToken(): Promise<string | null> {
  if (!inTauri) return sessionStorage.getItem(DEV_TOKEN_KEY);
  return invoke<string | null>('load_token');
}

export async function saveToken(token: string): Promise<void> {
  if (!inTauri) {
    sessionStorage.setItem(DEV_TOKEN_KEY, token);
    return;
  }
  await invoke('save_token', { token });
}

export async function deleteToken(): Promise<void> {
  if (!inTauri) {
    sessionStorage.removeItem(DEV_TOKEN_KEY);
    return;
  }
  await invoke('delete_token');
}

import { openUrl } from '@tauri-apps/plugin-opener';
import { inTauri } from './tauri';

const OPENABLE = /^(?:https?:|mailto:)/i;

/**
 * Opens a link from a message in the system browser. The WebView itself must never navigate
 * away from the app, so links in messages are intercepted and only http(s) and mailto are
 * handed over to the operating system.
 */
export async function openExternal(url: string): Promise<void> {
  if (!OPENABLE.test(url)) return;
  if (inTauri) {
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

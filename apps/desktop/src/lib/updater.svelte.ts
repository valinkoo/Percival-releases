import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { inTauri } from './tauri';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdatePhase = 'idle' | 'available' | 'installing' | 'failed';

/**
 * Looks for a newer build on GitHub Releases. The Tauri updater only installs a bundle whose
 * signature matches the public key embedded in `tauri.conf.json`, so a tampered download is
 * rejected before anything runs.
 */
export class Updater {
  phase = $state<UpdatePhase>('idle');
  /** Version offered by the release, once found. */
  version = $state<string | null>(null);
  /** Download progress in percent; null while the size is still unknown. */
  progress = $state<number | null>(null);

  #update: Update | null = null;
  #timer: ReturnType<typeof setInterval> | undefined;

  /** Checks now, then every few hours. Does nothing in a browser or in `tauri dev`. */
  start(): void {
    if (!inTauri || import.meta.env.DEV || this.#timer) return;
    void this.check();
    this.#timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async check(): Promise<void> {
    if (this.phase === 'installing') return;
    try {
      const update = await check();
      if (!update) return;
      this.#update = update;
      this.version = update.version;
      this.phase = 'available';
    } catch (error) {
      // Offline, or nothing published yet: not worth bothering the user.
      console.warn('Update check failed', error);
    }
  }

  /** Downloads and installs the update, then restarts the app. */
  async install(): Promise<void> {
    const update = this.#update;
    if (!update || this.phase === 'installing') return;
    this.phase = 'installing';
    this.progress = null;
    let total = 0;
    let received = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          received += event.data.chunkLength;
          this.progress = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null;
        }
      });
      await relaunch();
    } catch (error) {
      console.error('Update install failed', error);
      this.phase = 'failed';
    }
  }
}

export const updater = new Updater();

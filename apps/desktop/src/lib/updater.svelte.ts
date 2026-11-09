import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { inTauri } from './tauri';

/** At startup, then every four hours (the same rhythm as 4Elements). */
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

const AUTO_CHECK_KEY = 'percival.autoUpdate';

export type UpdatePhase = 'idle' | 'available' | 'installing' | 'failed';

/** What the last manual check ("Rechercher maintenant") found, for the settings window. */
export type CheckState = 'idle' | 'checking' | 'upToDate' | 'error';

function readAutoCheck(): boolean {
  try {
    return localStorage.getItem(AUTO_CHECK_KEY) !== '0'; // On unless the user turned it off.
  } catch {
    return true;
  }
}

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
  /** Whether the app looks for updates by itself (the user can turn it off). */
  autoCheck = $state(readAutoCheck());
  checkState = $state<CheckState>('idle');

  #update: Update | null = null;
  #timer: ReturnType<typeof setInterval> | undefined;

  /** Updates only exist in the installed app, not in a browser or in `tauri dev`. */
  get supported(): boolean {
    return inTauri && !import.meta.env.DEV;
  }

  /** Checks now, then every few hours, unless automatic checks are turned off. */
  start(): void {
    if (!this.supported || !this.autoCheck || this.#timer) return;
    void this.check();
    this.#timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  /** The "Chercher les mises à jour automatiquement" setting. */
  setAutoCheck(enabled: boolean): void {
    this.autoCheck = enabled;
    try {
      localStorage.setItem(AUTO_CHECK_KEY, enabled ? '1' : '0');
    } catch {
      // Not critical: the choice only lasts for this session.
    }
    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  /** Quiet check: a failure (offline, nothing published yet) is not worth bothering the user. */
  async check(): Promise<void> {
    await this.#look();
  }

  /** Check requested by the user: the outcome is shown in the settings. */
  async checkNow(): Promise<void> {
    if (this.checkState === 'checking') return;
    this.checkState = 'checking';
    const outcome = await this.#look();
    // An update found is shown through `phase`; an installation under way needs no message.
    this.checkState = outcome === 'upToDate' || outcome === 'error' ? outcome : 'idle';
  }

  async #look(): Promise<'available' | 'upToDate' | 'error' | 'busy'> {
    if (this.phase === 'installing') return 'busy';
    try {
      const update = await check();
      if (!update) return 'upToDate';
      this.#update = update;
      this.version = update.version;
      this.phase = 'available';
      return 'available';
    } catch (error) {
      console.warn('Update check failed', error);
      return 'error';
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

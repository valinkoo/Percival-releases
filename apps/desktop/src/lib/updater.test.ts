import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkMock = vi.fn();
const relaunchMock = vi.fn();

vi.mock('@tauri-apps/plugin-updater', () => ({ check: checkMock }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: relaunchMock }));
vi.mock('./tauri', () => ({ inTauri: true }));

const { Updater } = await import('./updater.svelte');

type ProgressEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished' };

function fakeUpdate(events: ProgressEvent[] = [], failure?: Error) {
  return {
    version: '0.0.9',
    downloadAndInstall: vi.fn(async (onEvent: (event: ProgressEvent) => void) => {
      for (const event of events) onEvent(event);
      if (failure) throw failure;
    }),
  };
}

beforeEach(() => {
  checkMock.mockReset();
  relaunchMock.mockReset();
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('Updater', () => {
  it('stays idle when no newer version exists', async () => {
    checkMock.mockResolvedValue(null);
    const updater = new Updater();
    await updater.check();
    expect(updater.phase).toBe('idle');
  });

  it('offers the version found by the release check', async () => {
    checkMock.mockResolvedValue(fakeUpdate());
    const updater = new Updater();
    await updater.check();
    expect(updater.phase).toBe('available');
    expect(updater.version).toBe('0.0.9');
  });

  it('ignores a failed check (offline, nothing published yet)', async () => {
    checkMock.mockRejectedValue(new Error('network down'));
    const updater = new Updater();
    await updater.check();
    expect(updater.phase).toBe('idle');
  });

  it('downloads, reports progress and restarts the app', async () => {
    const update = fakeUpdate([
      { event: 'Started', data: { contentLength: 200 } },
      { event: 'Progress', data: { chunkLength: 50 } },
      { event: 'Progress', data: { chunkLength: 150 } },
      { event: 'Finished' },
    ]);
    checkMock.mockResolvedValue(update);
    const updater = new Updater();
    await updater.check();
    await updater.install();
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(updater.progress).toBe(100);
    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a failed installation and allows a retry', async () => {
    const update = fakeUpdate([], new Error('disk full'));
    checkMock.mockResolvedValue(update);
    const updater = new Updater();
    await updater.check();
    await updater.install();
    expect(updater.phase).toBe('failed');
    expect(relaunchMock).not.toHaveBeenCalled();
    await updater.install();
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(2);
  });

  it('does nothing when install is called without an update', async () => {
    const updater = new Updater();
    await updater.install();
    expect(updater.phase).toBe('idle');
    expect(relaunchMock).not.toHaveBeenCalled();
  });
});

describe('Updater, manual check', () => {
  it('says the app is up to date when nothing newer exists', async () => {
    checkMock.mockResolvedValue(null);
    const updater = new Updater();
    await updater.checkNow();
    expect(updater.checkState).toBe('upToDate');
    expect(updater.phase).toBe('idle');
  });

  it('reports a failed check, unlike the quiet automatic one', async () => {
    checkMock.mockRejectedValue(new Error('network down'));
    const updater = new Updater();
    await updater.checkNow();
    expect(updater.checkState).toBe('error');
    expect(updater.phase).toBe('idle');
  });

  it('offers the update it finds, without a message of its own', async () => {
    checkMock.mockResolvedValue(fakeUpdate());
    const updater = new Updater();
    await updater.checkNow();
    expect(updater.phase).toBe('available');
    expect(updater.version).toBe('0.0.9');
    expect(updater.checkState).toBe('idle');
  });

  it('shows that a search is under way, and ignores a second request meanwhile', async () => {
    let finish: (value: null) => void = () => {};
    checkMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const updater = new Updater();
    const first = updater.checkNow();
    expect(updater.checkState).toBe('checking');
    await updater.checkNow();
    expect(checkMock).toHaveBeenCalledTimes(1);
    finish(null);
    await first;
    expect(updater.checkState).toBe('upToDate');
  });
});

describe('Updater, automatic checks', () => {
  it('are on by default and the choice survives a restart', () => {
    const updater = new Updater();
    expect(updater.autoCheck).toBe(true);
    updater.setAutoCheck(false);
    expect(localStorage.getItem('percival.autoUpdate')).toBe('0');
    expect(new Updater().autoCheck).toBe(false);
    updater.setAutoCheck(true);
    expect(new Updater().autoCheck).toBe(true);
  });

  it('check at startup, then every four hours, in the installed app', async () => {
    vi.useFakeTimers();
    vi.stubEnv('DEV', false);
    checkMock.mockResolvedValue(null);
    const updater = new Updater();
    updater.start();
    expect(checkMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(checkMock).toHaveBeenCalledTimes(2);
    updater.stop();
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(checkMock).toHaveBeenCalledTimes(2);
  });

  it('do not run when turned off, and stop as soon as they are', async () => {
    vi.useFakeTimers();
    vi.stubEnv('DEV', false);
    checkMock.mockResolvedValue(null);
    localStorage.setItem('percival.autoUpdate', '0');
    const updater = new Updater();
    updater.start();
    expect(checkMock).not.toHaveBeenCalled();

    updater.setAutoCheck(true); // starts right away
    expect(checkMock).toHaveBeenCalledTimes(1);
    updater.setAutoCheck(false);
    await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);
    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  it('never run in development builds', () => {
    // `import.meta.env.DEV` is true under Vitest, like in `tauri dev`.
    const updater = new Updater();
    expect(updater.supported).toBe(false);
    updater.start();
    expect(checkMock).not.toHaveBeenCalled();
  });
});

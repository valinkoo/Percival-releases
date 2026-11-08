import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
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

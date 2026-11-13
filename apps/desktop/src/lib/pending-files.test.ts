import { ATTACHMENTS_PER_MESSAGE_MAX, ATTACHMENT_MAX_BYTES } from '@percival/shared';
import { describe, expect, it } from 'vitest';
import { addPendingFiles } from './pending-files';

function file(name: string, size = 10, lastModified = 1): File {
  const created = new File([new Uint8Array(Math.min(size, 16))], name, { lastModified });
  // The real size is irrelevant for the checks, and allocating 25 MB per test is not.
  Object.defineProperty(created, 'size', { value: size });
  return created;
}

describe('addPendingFiles', () => {
  it('adds new files after the existing ones', () => {
    const first = file('a.png');
    const second = file('b.pdf');
    const result = addPendingFiles([first], [second]);
    expect(result.files).toEqual([first, second]);
    expect(result.problems).toEqual([]);
  });

  it('ignores a file that is already in the list', () => {
    const first = file('a.png', 10, 5);
    const result = addPendingFiles([first], [file('a.png', 10, 5)]);
    expect(result.files).toEqual([first]);
    expect(result.problems).toEqual([]);
  });

  it('keeps two different files that share a name', () => {
    const result = addPendingFiles([file('a.png', 10, 1)], [file('a.png', 10, 2)]);
    expect(result.files).toHaveLength(2);
  });

  it('refuses an empty file, naming it', () => {
    const result = addPendingFiles([], [file('vide.txt', 0)]);
    expect(result.files).toEqual([]);
    expect(result.problems).toEqual(['« vide.txt » est vide.']);
  });

  it('refuses a file over the size limit, with its size and the limit', () => {
    const result = addPendingFiles([], [file('film.mp4', ATTACHMENT_MAX_BYTES + 1)]);
    expect(result.files).toEqual([]);
    expect(result.problems).toEqual(['« film.mp4 » (25 Mo) dépasse la limite de 25 Mo.']);
  });

  it('accepts a file exactly at the size limit', () => {
    const result = addPendingFiles([], [file('limite.zip', ATTACHMENT_MAX_BYTES)]);
    expect(result.files).toHaveLength(1);
    expect(result.problems).toEqual([]);
  });

  it('stops at the maximum number of files and says so once', () => {
    const incoming = Array.from({ length: ATTACHMENTS_PER_MESSAGE_MAX + 3 }, (_, index) =>
      file(`f${index}.png`),
    );
    const result = addPendingFiles([], incoming);
    expect(result.files).toHaveLength(ATTACHMENTS_PER_MESSAGE_MAX);
    expect(result.problems).toEqual([
      `${ATTACHMENTS_PER_MESSAGE_MAX} fichiers au maximum par message.`,
    ]);
  });

  it('does not mutate the list it was given', () => {
    const current = [file('a.png')];
    addPendingFiles(current, [file('b.png')]);
    expect(current).toHaveLength(1);
  });
});

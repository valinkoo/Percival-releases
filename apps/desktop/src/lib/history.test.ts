import type { MessageDto, MessagesPageResponse } from '@percival/shared';
import { describe, expect, it } from 'vitest';
import {
  applyEvents,
  compareMessages,
  mergeMessages,
  reconcileLatestPage,
  type LoadedHistory,
} from './history';

/** m(3) is created after m(2), which is created after m(1). */
function m(n: number, content = `message ${n}`): MessageDto {
  const second = String(n).padStart(2, '0');
  return {
    id: `id-${second}`,
    channelId: 'channel',
    author: { id: 'author', username: 'alice', isBot: false, role: 'member' },
    content,
    attachments: [],
    createdAt: `2026-11-09T10:00:${second}.000Z`,
    updatedAt: `2026-11-09T10:00:${second}.000Z`,
    editedAt: null,
  };
}

const ids = (messages: MessageDto[]) => messages.map((message) => message.id);

describe('mergeMessages', () => {
  it('sorts oldest first and drops duplicates, the later list winning', () => {
    const merged = mergeMessages([m(3), m(1)], [m(2), m(3, 'edited')]);
    expect(ids(merged)).toEqual(['id-01', 'id-02', 'id-03']);
    expect(merged[2]?.content).toBe('edited');
  });

  it('breaks ties between messages created at the same instant by id', () => {
    const a = { ...m(1), id: 'a' };
    const b = { ...m(1), id: 'b' };
    expect(compareMessages(a, b)).toBeLessThan(0);
    expect(ids(mergeMessages([b, a]))).toEqual(['a', 'b']);
  });
});

describe('applyEvents', () => {
  it('replays upserts and removals in order', () => {
    const result = applyEvents(
      [m(1), m(2)],
      [
        { kind: 'upsert', message: m(2, 'edited') },
        { kind: 'upsert', message: m(3) },
        { kind: 'remove', id: 'id-01' },
      ],
    );
    expect(ids(result)).toEqual(['id-02', 'id-03']);
    expect(result[0]?.content).toBe('edited');
  });

  it('lets the last event win for a given message', () => {
    expect(
      ids(
        applyEvents(
          [m(1)],
          [
            { kind: 'remove', id: 'id-01' },
            { kind: 'upsert', message: m(1) },
          ],
        ),
      ),
    ).toEqual(['id-01']);
    expect(
      ids(
        applyEvents(
          [m(1)],
          [
            { kind: 'upsert', message: m(1, 'x') },
            { kind: 'remove', id: 'id-01' },
          ],
        ),
      ),
    ).toEqual([]);
  });

  it('ignores the removal of a message that is not there', () => {
    expect(ids(applyEvents([m(1)], [{ kind: 'remove', id: 'unknown' }]))).toEqual(['id-01']);
  });

  it('leaves its input untouched', () => {
    const input = [m(1)];
    applyEvents(input, [{ kind: 'remove', id: 'id-01' }]);
    expect(ids(input)).toEqual(['id-01']);
  });
});

describe('reconcileLatestPage', () => {
  const page = (messages: MessageDto[], nextBefore: string | null): MessagesPageResponse => ({
    messages,
    nextBefore,
  });

  it('empties a history whose channel has no message left', () => {
    const local: LoadedHistory = { messages: [m(1)], nextBefore: null };
    expect(reconcileLatestPage(local, page([], null))).toEqual({ messages: [], nextBefore: null });
  });

  it('takes the page as is when it reaches the beginning of the channel', () => {
    // m(1) was deleted while offline, m(4) arrived.
    const local: LoadedHistory = { messages: [m(1), m(2), m(3)], nextBefore: null };
    const result = reconcileLatestPage(local, page([m(2), m(3), m(4)], null));
    expect(ids(result.messages)).toEqual(['id-02', 'id-03', 'id-04']);
    expect(result.nextBefore).toBeNull();
  });

  it('picks up new messages, edits and deletions in the overlapping tail', () => {
    const local: LoadedHistory = { messages: [m(1), m(2), m(3), m(4), m(5)], nextBefore: 'id-01' };
    // m(4) was edited, m(5) deleted, m(6) and m(7) are new; the page starts at m(4).
    const result = reconcileLatestPage(local, page([m(4, 'edited'), m(6), m(7)], 'id-03'));
    expect(ids(result.messages)).toEqual(['id-01', 'id-02', 'id-03', 'id-04', 'id-06', 'id-07']);
    expect(result.messages[3]?.content).toBe('edited');
    // The older messages were kept, so the cursor to load even older ones is unchanged.
    expect(result.nextBefore).toBe('id-01');
  });

  it('keeps knowing it reached the beginning when the older part is kept', () => {
    const local: LoadedHistory = { messages: [m(1), m(2), m(3)], nextBefore: null };
    const result = reconcileLatestPage(local, page([m(3), m(4)], 'id-02'));
    expect(ids(result.messages)).toEqual(['id-01', 'id-02', 'id-03', 'id-04']);
    expect(result.nextBefore).toBeNull();
  });

  it('starts over from the page when more than a page was missed', () => {
    const local: LoadedHistory = { messages: [m(1), m(2)], nextBefore: 'id-00' };
    const result = reconcileLatestPage(local, page([m(10), m(11), m(12)], 'id-09'));
    expect(ids(result.messages)).toEqual(['id-10', 'id-11', 'id-12']);
    expect(result.nextBefore).toBe('id-09');
  });

  it('fills a history that was loaded empty', () => {
    const local: LoadedHistory = { messages: [], nextBefore: null };
    const result = reconcileLatestPage(local, page([m(5), m(6)], 'id-04'));
    expect(ids(result.messages)).toEqual(['id-05', 'id-06']);
    expect(result.nextBefore).toBe('id-04');
  });
});

import type { MessageDto, MessagesPageResponse } from '@percival/shared';

/** Something that happened to a message while the history of its channel was being fetched. */
export type HistoryEvent = { kind: 'upsert'; message: MessageDto } | { kind: 'remove'; id: string };

/** Display order of a channel: oldest first, ties broken by id (same as the server's cursor). */
export function compareMessages(a: MessageDto, b: MessageDto): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/** Merges message lists without duplicates, oldest first. */
export function mergeMessages(...lists: MessageDto[][]): MessageDto[] {
  // A later list wins when the same message appears twice (e.g. a live push and a refetch).
  const byId: Record<string, MessageDto> = {};
  for (const list of lists) {
    for (const message of list) byId[message.id] = message;
  }
  return Object.values(byId).sort(compareMessages);
}

/** Replays events on top of a list, in the order they happened. */
export function applyEvents(messages: MessageDto[], events: HistoryEvent[]): MessageDto[] {
  let result = messages;
  for (const event of events) {
    result =
      event.kind === 'upsert'
        ? mergeMessages(result, [event.message])
        : result.filter((message) => message.id !== event.id);
  }
  return result;
}

export interface LoadedHistory {
  messages: MessageDto[];
  nextBefore: string | null;
}

/**
 * Brings a history that may be stale (after a connection loss) up to date with a fresh copy of the
 * channel's latest page, so that missed new messages, edits and deletions are all picked up.
 *
 * What is kept stays one contiguous run of the channel:
 * - the page reaches the beginning of the channel, or shares no message with what is displayed
 *   (more than a page was missed): the page replaces everything, older messages are loaded again
 *   on demand;
 * - otherwise the page replaces the matching tail, and the older messages already loaded stay.
 */
export function reconcileLatestPage(
  local: LoadedHistory,
  page: MessagesPageResponse,
): LoadedHistory {
  const first = page.messages[0];
  if (!first) return { messages: [], nextBefore: null };
  if (page.nextBefore === null) return { messages: page.messages, nextBefore: null };

  const inPage = new Set(page.messages.map((message) => message.id));
  const overlaps = local.messages.some((message) => inPage.has(message.id));
  if (!overlaps) return { messages: page.messages, nextBefore: page.nextBefore };

  const older = local.messages.filter((message) => compareMessages(message, first) < 0);
  return { messages: [...older, ...page.messages], nextBefore: local.nextBefore };
}

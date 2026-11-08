import type { ChannelDto, MessageDto } from '@percival/shared';
import * as api from './api';
import { errorMessage } from './messages';
import { connectRealtime, type ConnectionState } from './realtime';
import { session } from './session.svelte';

const ACTIVE_CHANNEL_KEY = 'percival.activeChannel';

export interface ChannelHistory {
  /** Oldest first. */
  messages: MessageDto[];
  /** Cursor for the next page of older messages; `null` once the beginning is reached. */
  nextBefore: string | null;
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
}

function readActiveChannel(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CHANNEL_KEY);
  } catch {
    return null;
  }
}

function writeActiveChannel(id: string): void {
  try {
    localStorage.setItem(ACTIVE_CHANNEL_KEY, id);
  } catch {
    // Not critical: the first channel is selected next time.
  }
}

/** Merges message lists without duplicates, oldest first. */
function mergeMessages(...lists: MessageDto[][]): MessageDto[] {
  // A later list wins when the same message appears twice (e.g. a live push and a refetch).
  const byId: Record<string, MessageDto> = {};
  for (const list of lists) {
    for (const message of list) byId[message.id] = message;
  }
  return Object.values(byId).sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

class Chat {
  channels = $state<ChannelDto[]>([]);
  activeChannelId = $state<string | null>(null);
  histories = $state<Record<string, ChannelHistory>>({});
  connection = $state<ConnectionState>('offline');
  /** True while the channel list is loading. */
  loading = $state(false);
  /** Error loading the channel list, shown with a retry button. */
  error = $state<string | null>(null);

  #realtime: { close(): void } | null = null;
  /** Messages pushed while a channel's first page was still being fetched. */
  #pending = new Map<string, MessageDto[]>();

  get activeChannel(): ChannelDto | null {
    return this.channels.find((channel) => channel.id === this.activeChannelId) ?? null;
  }

  /** Connects the realtime socket, then loads the channels and the active channel's history. */
  async start(): Promise<void> {
    const token = session.token;
    if (!token || this.#realtime) return;

    // Connect first: anything published after this point reaches us, and the history fetched
    // afterwards fills in what happened before.
    this.#realtime = connectRealtime(session.serverUrl, token, {
      onState: (state) => (this.connection = state),
      onMessage: (message) => this.#receive(message),
      onChannel: (channel) => this.#addChannel(channel),
      onResume: () => void this.#resync(),
      onUnauthorized: () => void session.expire(),
    });

    await this.#loadChannels();
  }

  stop(): void {
    this.#realtime?.close();
    this.#realtime = null;
    this.#pending.clear();
    this.channels = [];
    this.activeChannelId = null;
    this.histories = {};
    this.connection = 'offline';
    this.loading = false;
    this.error = null;
  }

  async #loadChannels(): Promise<void> {
    const token = session.token;
    if (!token) return;
    this.loading = true;
    this.error = null;
    try {
      const { channels } = await api.listChannels(session.serverUrl, token);
      this.channels = channels;
    } catch (error) {
      this.error = errorMessage(error);
      return;
    } finally {
      this.loading = false;
    }

    const remembered = readActiveChannel();
    const first = this.channels.find((channel) => channel.id === remembered) ?? this.channels[0];
    if (first) await this.select(first.id);
  }

  retry(): Promise<void> {
    return this.#loadChannels();
  }

  async select(channelId: string): Promise<void> {
    this.activeChannelId = channelId;
    writeActiveChannel(channelId);
    if (!this.histories[channelId]) {
      await this.#loadLatest(channelId);
    }
  }

  /** Loads the first page of a channel. Also used to retry after an error. */
  async #loadLatest(channelId: string): Promise<void> {
    const token = session.token;
    if (!token) return;
    this.histories[channelId] = {
      messages: [],
      nextBefore: null,
      loading: true,
      loadingOlder: false,
      error: null,
    };
    try {
      const page = await api.fetchMessages(session.serverUrl, token, channelId);
      const history = this.histories[channelId];
      if (history) {
        history.messages = mergeMessages(page.messages, this.#pending.get(channelId) ?? []);
        history.nextBefore = page.nextBefore;
      }
    } catch (error) {
      const history = this.histories[channelId];
      if (history) history.error = errorMessage(error);
    } finally {
      this.#pending.delete(channelId);
      const history = this.histories[channelId];
      if (history) history.loading = false;
    }
  }

  retryHistory(channelId: string): Promise<void> {
    return this.#loadLatest(channelId);
  }

  async loadOlder(channelId: string): Promise<void> {
    const token = session.token;
    const history = this.histories[channelId];
    if (!token || !history || history.loadingOlder || !history.nextBefore) return;
    history.loadingOlder = true;
    history.error = null;
    try {
      const page = await api.fetchMessages(session.serverUrl, token, channelId, history.nextBefore);
      history.messages = mergeMessages(page.messages, history.messages);
      history.nextBefore = page.nextBefore;
    } catch (error) {
      history.error = errorMessage(error);
    } finally {
      history.loadingOlder = false;
    }
  }

  /** Returns a French error message, or `null` when the message was sent. */
  async send(channelId: string, content: string): Promise<string | null> {
    const token = session.token;
    if (!token) return errorMessage(null);
    try {
      const { message } = await api.sendMessage(session.serverUrl, token, channelId, content);
      this.#receive(message);
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  /** Returns a French error message, or `null` when the channel was created. */
  async createChannel(name: string, description: string): Promise<string | null> {
    const token = session.token;
    if (!token) return errorMessage(null);
    try {
      const { channel } = await api.createChannel(session.serverUrl, token, {
        name,
        ...(description.trim() !== '' ? { description } : {}),
      });
      this.#addChannel(channel);
      await this.select(channel.id);
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  #addChannel(channel: ChannelDto): void {
    if (this.channels.some((existing) => existing.id === channel.id)) return;
    this.channels = [...this.channels, channel].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  }

  #receive(message: MessageDto): void {
    const history = this.histories[message.channelId];
    if (!history) return; // Channel never opened: its history is fetched when it is.
    if (history.loading) {
      const queue = this.#pending.get(message.channelId) ?? [];
      queue.push(message);
      this.#pending.set(message.channelId, queue);
      return;
    }
    history.messages = mergeMessages(history.messages, [message]);
  }

  /** After a reconnection, refetch the latest page of the open channel to close the gap. */
  async #resync(): Promise<void> {
    const token = session.token;
    const channelId = this.activeChannelId;
    const history = channelId ? this.histories[channelId] : undefined;
    if (!token || !channelId || !history) return;
    try {
      const page = await api.fetchMessages(session.serverUrl, token, channelId);
      history.messages = mergeMessages(history.messages, page.messages);
    } catch {
      // The next reconnection or channel switch will try again.
    }
  }
}

export const chat = new Chat();

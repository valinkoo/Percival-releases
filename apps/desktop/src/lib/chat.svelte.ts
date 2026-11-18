import {
  TYPING_EXPIRES_MS,
  TYPING_SEND_INTERVAL_MS,
  type ChannelDto,
  type MessageDto,
  type UserTypingEvent,
} from '@percival/shared';
import * as api from './api';
import { applyEvents, mergeMessages, reconcileLatestPage, type HistoryEvent } from './history';
import { errorMessage } from './messages';
import { attachmentSummary, notificationBody, showNotification } from './notify';
import { connectRealtime, type ConnectionState, type RealtimeConnection } from './realtime';
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

class Chat {
  channels = $state<ChannelDto[]>([]);
  activeChannelId = $state<string | null>(null);
  histories = $state<Record<string, ChannelHistory>>({});
  connection = $state<ConnectionState>('offline');
  /** True while the channel list is loading. */
  loading = $state(false);
  /** Error loading the channel list, shown with a retry button. */
  error = $state<string | null>(null);
  /** Unread messages by channel id; channels with nothing unread have no entry. */
  unread = $state<Record<string, number>>({});
  /** Who is typing, by channel id then user id (their name). Entries expire on their own. */
  typing = $state<Record<string, Record<string, string>>>({});
  /** The window is in the foreground: messages that arrive are seen, not notified. */
  windowFocused = $state(true);
  /** The open channel is scrolled to its newest message. */
  atBottom = $state(true);

  #realtime: RealtimeConnection | null = null;
  /**
   * What happened to a channel's history while it was being fetched. The fetched page may predate
   * these events, so they are replayed on top of it.
   */
  #pending = new Map<string, HistoryEvent[]>();
  #typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  #typingSentAt = new Map<string, number>();
  /** Last message reported as read to the server, by channel id. */
  #markedRead = new Map<string, string>();
  #untrackFocus: (() => void) | null = null;

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
      onMessageUpdated: (message) => this.#dispatch(message.channelId, { kind: 'upsert', message }),
      onMessageDeleted: ({ id, channelId }) => this.#dispatch(channelId, { kind: 'remove', id }),
      onTyping: (event) => this.#onTyping(event),
      onChannel: (channel) => this.#addChannel(channel),
      onChannelUpdated: (channel) => this.#replaceChannel(channel),
      onChannelRemoved: (channelId) => this.#removeChannel(channelId),
      onAccountUpdated: (user) => session.setUser(user),
      onResume: () => void this.#resync(),
      onUnauthorized: (reason) => void session.expire(reason),
    });
    this.#trackFocus();

    await this.#loadChannels();
  }

  /**
   * Starts over with the session's current token: the realtime connection was opened with the
   * previous one, which the server closed (the person changed their password).
   */
  restart(): Promise<void> {
    this.stop();
    return this.start();
  }

  stop(): void {
    this.#realtime?.close();
    this.#realtime = null;
    this.#untrackFocus?.();
    this.#untrackFocus = null;
    for (const timer of this.#typingTimers.values()) clearTimeout(timer);
    this.#typingTimers.clear();
    this.#typingSentAt.clear();
    this.#markedRead.clear();
    this.#pending.clear();
    this.channels = [];
    this.activeChannelId = null;
    this.histories = {};
    this.unread = {};
    this.typing = {};
    this.atBottom = true;
    this.connection = 'offline';
    this.loading = false;
    this.error = null;
  }

  /** Follows whether the window is in the foreground, to decide what counts as seen. */
  #trackFocus(): void {
    const update = () =>
      this.setFocused(document.hasFocus() && document.visibilityState === 'visible');
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    update();
    this.#untrackFocus = () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    };
  }

  setFocused(focused: boolean): void {
    this.windowFocused = focused;
    if (focused) this.#maybeMarkRead();
  }

  /** The message list reports whether the reader is at the newest message. */
  setAtBottom(atBottom: boolean): void {
    this.atBottom = atBottom;
    if (atBottom) this.#maybeMarkRead();
  }

  async #loadChannels(): Promise<void> {
    const token = session.token;
    if (!token) return;
    this.loading = true;
    this.error = null;
    try {
      const { channels, unread } = await api.listChannels(session.serverUrl, token);
      this.channels = channels;
      // The app updates itself, the server is updated by hand: tolerate a server that predates
      // the read state instead of breaking the channel list.
      this.unread = unread ?? {};
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
    this.atBottom = true; // The list of a freshly opened channel starts at its newest message.
    writeActiveChannel(channelId);
    if (!this.histories[channelId]) {
      await this.#loadLatest(channelId);
    } else {
      this.#maybeMarkRead();
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
    this.#pending.set(channelId, []);
    try {
      const page = await api.fetchMessages(session.serverUrl, token, channelId);
      const history = this.histories[channelId];
      if (history) {
        history.messages = applyEvents(page.messages, this.#pending.get(channelId) ?? []);
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
    this.#maybeMarkRead();
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
  async send(
    channelId: string,
    content: string,
    files: readonly File[] = [],
  ): Promise<string | null> {
    const token = session.token;
    if (!token) return errorMessage(null);
    try {
      const { message } = await api.sendMessage(
        session.serverUrl,
        token,
        channelId,
        content,
        files,
      );
      this.#receive(message);
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  /** The author rewrites a message. Returns a French error message, or `null` on success. */
  async editMessage(message: MessageDto, content: string): Promise<string | null> {
    const token = session.token;
    if (!token) return errorMessage(null);
    try {
      const { message: updated } = await api.editMessage(
        session.serverUrl,
        token,
        message.channelId,
        message.id,
        content,
      );
      this.#dispatch(updated.channelId, { kind: 'upsert', message: updated });
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  /** The author deletes a message. Returns a French error message, or `null` on success. */
  async deleteMessage(message: MessageDto): Promise<string | null> {
    const token = session.token;
    if (!token) return errorMessage(null);
    try {
      await api.deleteMessage(session.serverUrl, token, message.channelId, message.id);
      this.#dispatch(message.channelId, { kind: 'remove', id: message.id });
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  /** Returns a French error message, or `null` when the channel was created. */
  async createChannel(
    name: string,
    description: string,
    isPrivate = false,
  ): Promise<string | null> {
    const token = session.token;
    if (!token) return errorMessage(null);
    try {
      const { channel } = await api.createChannel(session.serverUrl, token, {
        name,
        ...(description.trim() !== '' ? { description } : {}),
        ...(isPrivate ? { isPrivate } : {}),
      });
      this.#addChannel(channel);
      await this.select(channel.id);
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  /** Renames a channel or changes its description. Returns a French error message, or `null`. */
  async updateChannel(
    channelId: string,
    changes: { name: string; description: string },
  ): Promise<string | null> {
    const token = session.token;
    if (!token) return errorMessage(null);
    try {
      const { channel } = await api.updateChannel(session.serverUrl, token, channelId, changes);
      this.#replaceChannel(channel);
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

  #replaceChannel(channel: ChannelDto): void {
    this.channels = this.channels.map((existing) =>
      existing.id === channel.id ? channel : existing,
    );
  }

  /**
   * The user can no longer see the channel. Everything held about it goes, and if it was open,
   * the first remaining channel takes its place.
   */
  #removeChannel(channelId: string): void {
    if (!this.channels.some((channel) => channel.id === channelId)) return;
    this.channels = this.channels.filter((channel) => channel.id !== channelId);
    delete this.histories[channelId];
    delete this.unread[channelId];
    delete this.typing[channelId];
    this.#pending.delete(channelId);
    this.#markedRead.delete(channelId);
    if (this.activeChannelId === channelId) {
      const next = this.channels[0];
      if (next) {
        void this.select(next.id);
      } else {
        this.activeChannelId = null;
      }
    }
  }

  /** Names of the people currently typing in a channel (never the signed-in user). */
  typingUsers(channelId: string): string[] {
    return Object.values(this.typing[channelId] ?? {});
  }

  /** Called as the user types: tells the channel, at most once every few seconds. */
  notifyTyping(channelId: string): void {
    const now = Date.now();
    if (now - (this.#typingSentAt.get(channelId) ?? 0) < TYPING_SEND_INTERVAL_MS) return;
    this.#typingSentAt.set(channelId, now);
    this.#realtime?.sendTyping(channelId);
  }

  #onTyping({ channelId, user }: UserTypingEvent): void {
    if (user.id === session.user?.id) return;
    (this.typing[channelId] ??= {})[user.id] = user.username;
    const key = `${channelId}:${user.id}`;
    clearTimeout(this.#typingTimers.get(key));
    this.#typingTimers.set(
      key,
      setTimeout(() => this.#clearTyping(channelId, user.id), TYPING_EXPIRES_MS),
    );
  }

  #clearTyping(channelId: string, userId: string): void {
    const key = `${channelId}:${userId}`;
    clearTimeout(this.#typingTimers.get(key));
    this.#typingTimers.delete(key);
    const users = this.typing[channelId];
    if (users) delete users[userId];
  }

  /** A new message: someone who sends a message has stopped typing; others' messages count. */
  #receive(message: MessageDto): void {
    this.#clearTyping(message.channelId, message.author.id);
    if (message.author.id !== session.user?.id) this.#countAndNotify(message);
    this.#dispatch(message.channelId, { kind: 'upsert', message });
    if (message.channelId === this.activeChannelId) this.#maybeMarkRead();
  }

  #countAndNotify(message: MessageDto): void {
    const beingRead =
      message.channelId === this.activeChannelId && this.windowFocused && this.atBottom;
    if (!beingRead) {
      this.unread[message.channelId] = (this.unread[message.channelId] ?? 0) + 1;
    }
    if (!this.windowFocused) {
      const channel = this.channels.find((candidate) => candidate.id === message.channelId);
      const where = channel ? `#${channel.name}` : 'Percival';
      void showNotification(
        `${where} · ${message.author.username}`,
        notificationBody(message.content) || attachmentSummary(message.attachments ?? []),
      );
    }
  }

  /** Applies a change to a channel's history, or queues it while that history is being fetched. */
  #dispatch(channelId: string, event: HistoryEvent): void {
    const queue = this.#pending.get(channelId);
    if (queue) {
      queue.push(event);
      return;
    }
    const history = this.histories[channelId];
    if (!history) return; // Channel never opened: its history is fetched when it is.
    history.messages = applyEvents(history.messages, [event]);
  }

  /**
   * Reports the open channel as read once it is really being read: the window is in the
   * foreground and the list shows the newest message.
   */
  #maybeMarkRead(): void {
    const channelId = this.activeChannelId;
    const token = session.token;
    if (!channelId || !token || !this.windowFocused || !this.atBottom) return;
    if (this.#pending.has(channelId)) return; // Called again when the history has loaded.
    const last = this.histories[channelId]?.messages.at(-1);
    if (!last) return;

    const hadUnread = (this.unread[channelId] ?? 0) > 0;
    if (hadUnread) delete this.unread[channelId];
    if (!hadUnread && this.#markedRead.get(channelId) === last.id) return;

    this.#markedRead.set(channelId, last.id);
    api.markChannelRead(session.serverUrl, token, channelId, last.id).catch(() => {
      // Tried again the next time the channel is read.
      if (this.#markedRead.get(channelId) === last.id) this.#markedRead.delete(channelId);
    });
  }

  /**
   * After a reconnection, events may have been missed: refetch the channel list (new channels,
   * unread counters) and the latest page of every channel already opened, which also picks up
   * edits and deletions.
   */
  async #resync(): Promise<void> {
    await Promise.all([
      this.#refreshChannels(),
      ...Object.keys(this.histories).map((channelId) => this.#refreshHistory(channelId)),
    ]);
    this.#maybeMarkRead();
  }

  async #refreshChannels(): Promise<void> {
    const token = session.token;
    if (!token) return;
    try {
      const { channels, unread } = await api.listChannels(session.serverUrl, token);
      // What changed while offline: channels gained, renamed or lost.
      const stillVisible = new Set(channels.map((channel) => channel.id));
      for (const known of [...this.channels]) {
        if (!stillVisible.has(known.id)) this.#removeChannel(known.id);
      }
      for (const channel of channels) {
        this.#addChannel(channel);
        this.#replaceChannel(channel);
      }
      this.unread = unread ?? {};
    } catch {
      // The next reconnection will try again.
    }
  }

  async #refreshHistory(channelId: string): Promise<void> {
    const token = session.token;
    const history = this.histories[channelId];
    if (!token || !history || history.loading || this.#pending.has(channelId)) return;
    this.#pending.set(channelId, []);
    try {
      const page = await api.fetchMessages(session.serverUrl, token, channelId);
      const current = this.histories[channelId];
      if (current) {
        const merged = reconcileLatestPage(
          { messages: current.messages, nextBefore: current.nextBefore },
          page,
        );
        current.messages = applyEvents(merged.messages, this.#pending.get(channelId) ?? []);
        current.nextBefore = merged.nextBefore;
      }
    } catch {
      // The next reconnection or channel switch will try again.
    } finally {
      this.#pending.delete(channelId);
    }
  }
}

export const chat = new Chat();

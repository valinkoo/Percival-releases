export interface MessageAuthorDto {
  id: string;
  username: string;
  isBot: boolean;
}

export interface MessageDto {
  id: string;
  channelId: string;
  author: MessageAuthorDto;
  /** Markdown source. The client sanitizes it when rendering. */
  content: string;
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
  /** ISO 8601 timestamp of the author's last edit, `null` for a message never edited. */
  editedAt: string | null;
}

export interface SendMessageRequest {
  content: string;
}

export interface SendMessageResponse {
  message: MessageDto;
}

export interface EditMessageRequest {
  content: string;
}

export interface EditMessageResponse {
  message: MessageDto;
}

/** A deleted message is only hidden (soft delete): the server keeps the row for the archive. */
export interface DeleteMessageResponse {
  id: string;
  channelId: string;
}

/** One page of history, oldest message first. */
export interface MessagesPageResponse {
  messages: MessageDto[];
  /**
   * Pass it as `before` to get the page of older messages. `null` when the beginning of the
   * channel is reached.
   */
  nextBefore: string | null;
}

/** Marks a channel as read up to (and including) this message. */
export interface MarkChannelReadRequest {
  messageId: string;
}

export interface MarkChannelReadResponse {
  channelId: string;
  /** ISO 8601 timestamp: messages created after it are unread. */
  lastReadAt: string;
}

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
}

export interface SendMessageRequest {
  content: string;
}

export interface SendMessageResponse {
  message: MessageDto;
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

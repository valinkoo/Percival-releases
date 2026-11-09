export interface ChannelDto {
  id: string;
  name: string;
  description: string;
  isPrivate: boolean;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface ChannelsResponse {
  channels: ChannelDto[];
  /**
   * Unread messages of the authenticated user, by channel id. Channels with nothing unread are
   * left out. Messages written by the user themselves never count.
   */
  unread: Record<string, number>;
}

export interface CreateChannelRequest {
  name: string;
  description?: string;
}

export interface CreateChannelResponse {
  channel: ChannelDto;
}

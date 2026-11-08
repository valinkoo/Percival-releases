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
}

export interface CreateChannelRequest {
  name: string;
  description?: string;
}

export interface CreateChannelResponse {
  channel: ChannelDto;
}

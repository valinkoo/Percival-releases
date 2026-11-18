import type { RoleName } from './roles.js';

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
  /** A private channel is only visible to its members; its creator becomes one. Fixed for good. */
  isPrivate?: boolean;
}

export interface CreateChannelResponse {
  channel: ChannelDto;
}

/** At least one field. Whether a channel is private cannot be changed after its creation. */
export interface UpdateChannelRequest {
  name?: string;
  description?: string;
}

export interface UpdateChannelResponse {
  channel: ChannelDto;
}

export interface ChannelMemberDto {
  id: string;
  username: string;
  role: RoleName;
}

export interface ChannelMembersResponse {
  /** Everyone explicitly listed for the channel (what `channel_members` holds). */
  members: ChannelMemberDto[];
  /**
   * People that can be added: active accounts not yet listed, whose access the list can change.
   * Admins never appear (they see every channel); on a public channel only guests do (everyone
   * else sees it anyway).
   */
  candidates: ChannelMemberDto[];
}

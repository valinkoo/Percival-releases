import type { ChannelDto } from '@percival/shared';

export function toChannelDto(channel: {
  id: string;
  name: string;
  description: string;
  isPrivate: boolean;
  createdAt: Date;
}): ChannelDto {
  return {
    id: channel.id,
    name: channel.name,
    description: channel.description,
    isPrivate: channel.isPrivate,
    createdAt: channel.createdAt.toISOString(),
  };
}

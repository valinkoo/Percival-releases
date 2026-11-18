import type {
  ChannelMembersResponse,
  CreateUserRequest,
  ManagedUserDto,
  UpdateUserRequest,
} from '@percival/shared';
import * as api from './api';
import type { ApiErrorCode } from './api';
import { errorMessage } from './messages';
import { session } from './session.svelte';

/** What an administration call came back with: the value, or the French message to show. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; message: string };

type Overrides = Partial<Record<ApiErrorCode, string>>;

const USER_MESSAGES: Overrides = {
  conflict: "Ce nom d'utilisateur est déjà pris.",
  not_found: "Ce compte n'existe plus, ou vous ne pouvez plus le voir.",
  forbidden: "Vous n'avez pas le droit d'effectuer cette action sur ce compte.",
};

const CHANNEL_MESSAGES: Overrides = {
  not_found: "Ce salon n'existe plus, ou vous ne pouvez plus le voir.",
};

async function run<T>(
  call: (serverUrl: string, token: string) => Promise<T>,
  overrides: Overrides,
): Promise<Outcome<T>> {
  const token = session.token;
  if (!token) return { ok: false, message: errorMessage(null) };
  try {
    return { ok: true, value: await call(session.serverUrl, token) };
  } catch (error) {
    return { ok: false, message: errorMessage(error, overrides) };
  }
}

/** Accounts and channel members, for the screens only administrators and moderators reach. */
export const admin = {
  listUsers: (): Promise<Outcome<ManagedUserDto[]>> =>
    run(async (url, token) => (await api.listUsers(url, token)).users, USER_MESSAGES),

  createUser: (body: CreateUserRequest): Promise<Outcome<ManagedUserDto>> =>
    run(async (url, token) => (await api.createUser(url, token, body)).user, USER_MESSAGES),

  updateUser: (userId: string, body: UpdateUserRequest): Promise<Outcome<ManagedUserDto>> =>
    run(async (url, token) => (await api.updateUser(url, token, userId, body)).user, USER_MESSAGES),

  resetPassword: (userId: string, password: string): Promise<Outcome<ManagedUserDto>> =>
    run(
      async (url, token) => (await api.resetUserPassword(url, token, userId, password)).user,
      USER_MESSAGES,
    ),

  listMembers: (channelId: string): Promise<Outcome<ChannelMembersResponse>> =>
    run((url, token) => api.listChannelMembers(url, token, channelId), CHANNEL_MESSAGES),

  addMember: (channelId: string, userId: string): Promise<Outcome<ChannelMembersResponse>> =>
    run((url, token) => api.addChannelMember(url, token, channelId, userId), {
      ...CHANNEL_MESSAGES,
      not_found: "Cette personne n'existe plus, ou son compte est désactivé.",
    }),

  removeMember: (channelId: string, userId: string): Promise<Outcome<ChannelMembersResponse>> =>
    run((url, token) => api.removeChannelMember(url, token, channelId, userId), CHANNEL_MESSAGES),
};

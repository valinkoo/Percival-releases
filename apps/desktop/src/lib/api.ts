import {
  ERROR_CODES,
  type ApiErrorBody,
  type ChannelsResponse,
  type CreateChannelRequest,
  type CreateChannelResponse,
  type ErrorCode,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
  type MessagesPageResponse,
  type SendMessageResponse,
} from '@percival/shared';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Client-side codes added to the API's own error codes:
 * - `network`: the server could not be reached (no HTTP response, or a proxy saying it is down);
 * - `invalid_server`: something answered, but not like a Percival API (wrong address or port).
 */
export type ApiErrorCode = ErrorCode | 'network' | 'invalid_server';

/** Statuses a reverse proxy (e.g. `tailscale serve`) returns when the API behind it is down. */
const PROXY_UNREACHABLE_STATUSES = new Set([502, 503, 504]);

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
  ) {
    super(`API error: ${code} (HTTP ${status})`);
    this.name = 'ApiError';
  }
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

let unauthorizedHandler: (() => void) | null = null;

/** Called when the server rejects the session token (expired, or the account is gone). */
export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

async function request<T>(
  serverUrl: string,
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${serverUrl}${path}`, { ...init, headers, signal: controller.signal });
  } catch {
    throw new ApiError('network', 0);
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Empty or non-JSON body.
  }

  if (!response.ok) {
    const code = (payload as Partial<ApiErrorBody> | null)?.error?.code;
    if (isErrorCode(code)) {
      if (code === 'unauthorized' && token) unauthorizedHandler?.();
      throw new ApiError(code, response.status);
    }
    const unreachable = PROXY_UNREACHABLE_STATUSES.has(response.status);
    throw new ApiError(unreachable ? 'network' : 'invalid_server', response.status);
  }
  // A successful answer must be a JSON object, otherwise this is not the Percival API
  // (for example a web page served at that address).
  if (typeof payload !== 'object' || payload === null) {
    throw new ApiError('invalid_server', response.status);
  }
  return payload as T;
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function login(serverUrl: string, credentials: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>(serverUrl, '/api/auth/login', jsonBody(credentials));
}

export function fetchMe(serverUrl: string, token: string): Promise<MeResponse> {
  return request<MeResponse>(serverUrl, '/api/auth/me', {}, token);
}

export function listChannels(serverUrl: string, token: string): Promise<ChannelsResponse> {
  return request<ChannelsResponse>(serverUrl, '/api/channels', {}, token);
}

export function createChannel(
  serverUrl: string,
  token: string,
  channel: CreateChannelRequest,
): Promise<CreateChannelResponse> {
  return request<CreateChannelResponse>(serverUrl, '/api/channels', jsonBody(channel), token);
}

export function fetchMessages(
  serverUrl: string,
  token: string,
  channelId: string,
  before?: string,
): Promise<MessagesPageResponse> {
  const query = before ? `?before=${encodeURIComponent(before)}` : '';
  return request<MessagesPageResponse>(
    serverUrl,
    `/api/channels/${encodeURIComponent(channelId)}/messages${query}`,
    {},
    token,
  );
}

export function sendMessage(
  serverUrl: string,
  token: string,
  channelId: string,
  content: string,
): Promise<SendMessageResponse> {
  return request<SendMessageResponse>(
    serverUrl,
    `/api/channels/${encodeURIComponent(channelId)}/messages`,
    jsonBody({ content }),
    token,
  );
}

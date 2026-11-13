import {
  ERROR_CODES,
  type ApiErrorBody,
  type ChannelsResponse,
  type CreateChannelRequest,
  type CreateChannelResponse,
  type DeleteMessageResponse,
  type EditMessageResponse,
  type ErrorCode,
  type LoginRequest,
  type LoginResponse,
  type MarkChannelReadRequest,
  type MarkChannelReadResponse,
  type MeResponse,
  type MessagesPageResponse,
  type SendMessageResponse,
} from '@percival/shared';

const REQUEST_TIMEOUT_MS = 10_000;
/** Sending files (up to 5 x 25 MB) and fetching one take far longer than a JSON request. */
const UPLOAD_TIMEOUT_MS = 10 * 60_000;
const DOWNLOAD_TIMEOUT_MS = 2 * 60_000;

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

/** The error for a non-2xx answer, whose body (already read) may carry a Percival error code. */
function errorFor(response: Response, payload: unknown, token?: string): ApiError {
  const code = (payload as Partial<ApiErrorBody> | null)?.error?.code;
  if (isErrorCode(code)) {
    if (code === 'unauthorized' && token) unauthorizedHandler?.();
    return new ApiError(code, response.status);
  }
  const unreachable = PROXY_UNREACHABLE_STATUSES.has(response.status);
  return new ApiError(unreachable ? 'network' : 'invalid_server', response.status);
}

async function request<T>(
  serverUrl: string,
  path: string,
  init: RequestInit = {},
  token?: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
    throw errorFor(response, payload, token);
  }
  // A successful answer must be a JSON object, otherwise this is not the Percival API
  // (for example a web page served at that address).
  if (typeof payload !== 'object' || payload === null) {
    throw new ApiError('invalid_server', response.status);
  }
  return payload as T;
}

function jsonBody(body: unknown, method = 'POST'): RequestInit {
  return {
    method,
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

/**
 * Sends a message. Text alone goes as JSON; with files it becomes `multipart/form-data`, where the
 * `content` field comes before the `files` parts (the server needs no particular order, but it is
 * the natural one). No `Content-Type` is set for the form: the browser adds the boundary itself.
 */
export function sendMessage(
  serverUrl: string,
  token: string,
  channelId: string,
  content: string,
  files: readonly File[] = [],
): Promise<SendMessageResponse> {
  const path = `/api/channels/${encodeURIComponent(channelId)}/messages`;
  if (files.length === 0) {
    return request<SendMessageResponse>(serverUrl, path, jsonBody({ content }), token);
  }
  const form = new FormData();
  form.append('content', content);
  for (const file of files) form.append('files', file, file.name);
  return request<SendMessageResponse>(
    serverUrl,
    path,
    { method: 'POST', body: form },
    token,
    UPLOAD_TIMEOUT_MS,
  );
}

/**
 * The bytes of an attachment. The token travels in a header, so the file cannot be handed to an
 * `<img>` or a link directly: the caller turns the blob into an object URL or saves it.
 */
export async function fetchAttachment(
  serverUrl: string,
  token: string,
  attachmentId: string,
): Promise<Blob> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(`${serverUrl}/api/attachments/${encodeURIComponent(attachmentId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } catch {
      throw new ApiError('network', 0);
    }
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      throw errorFor(response, payload, token);
    }
    try {
      return await response.blob();
    } catch {
      throw new ApiError('network', 0); // The connection dropped in the middle of the file.
    }
  } finally {
    clearTimeout(timer);
  }
}

export function editMessage(
  serverUrl: string,
  token: string,
  channelId: string,
  messageId: string,
  content: string,
): Promise<EditMessageResponse> {
  return request<EditMessageResponse>(
    serverUrl,
    `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    jsonBody({ content }, 'PATCH'),
    token,
  );
}

export function deleteMessage(
  serverUrl: string,
  token: string,
  channelId: string,
  messageId: string,
): Promise<DeleteMessageResponse> {
  // No body, hence no Content-Type: the server would refuse an empty JSON body.
  return request<DeleteMessageResponse>(
    serverUrl,
    `/api/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    { method: 'DELETE' },
    token,
  );
}

export function markChannelRead(
  serverUrl: string,
  token: string,
  channelId: string,
  messageId: string,
): Promise<MarkChannelReadResponse> {
  return request<MarkChannelReadResponse>(
    serverUrl,
    `/api/channels/${encodeURIComponent(channelId)}/read`,
    jsonBody({ messageId } satisfies MarkChannelReadRequest),
    token,
  );
}

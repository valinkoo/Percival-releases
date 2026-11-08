import {
  ERROR_CODES,
  type ApiErrorBody,
  type ErrorCode,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
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

async function request<T>(serverUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${serverUrl}${path}`, { ...init, signal: controller.signal });
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

export function login(serverUrl: string, credentials: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>(serverUrl, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
}

export function fetchMe(serverUrl: string, token: string): Promise<MeResponse> {
  return request<MeResponse>(serverUrl, '/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchMe, listChannels, login, onUnauthorized } from './api';

function respond(body: BodyInit | null, init: ResponseInit = {}) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, init)));
}

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected the request to fail');
}

afterEach(() => {
  vi.unstubAllGlobals();
  onUnauthorized(() => undefined);
});

describe('api error mapping', () => {
  it('maps a Percival error body to its code', async () => {
    respond(JSON.stringify({ error: { code: 'invalid_credentials', message: 'x' } }), {
      status: 401,
    });
    const error = await failureOf(login('http://localhost:3000', { username: 'a', password: 'b' }));
    expect(error).toMatchObject({ code: 'invalid_credentials', status: 401 });
  });

  it('reports an unreachable server as `network`', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await failureOf(fetchMe('http://localhost:3000', 't'));
    expect(error.code).toBe('network');
  });

  it('treats a proxy answering 502/503/504 as an unreachable server', async () => {
    for (const status of [502, 503, 504]) {
      respond('Bad Gateway', { status });
      expect((await failureOf(fetchMe('https://x.ts.net', 't'))).code).toBe('network');
    }
  });

  it('flags an answer that is not the Percival API as `invalid_server`', async () => {
    respond('<html>Not found</html>', { status: 404 });
    expect((await failureOf(fetchMe('http://localhost:1420', 't'))).code).toBe('invalid_server');

    respond('<html>Welcome</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    expect((await failureOf(fetchMe('http://localhost:1420', 't'))).code).toBe('invalid_server');
  });

  it('sends the token as a Bearer header', async () => {
    respond(JSON.stringify({ channels: [] }), { status: 200 });
    await listChannels('http://localhost:3000', 'my-token');
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer my-token');
  });

  it('notifies the session handler when an authenticated request is unauthorized', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    respond(JSON.stringify({ error: { code: 'unauthorized', message: 'x' } }), { status: 401 });
    await failureOf(fetchMe('http://localhost:3000', 'expired'));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not treat a failed login as an expired session', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    respond(JSON.stringify({ error: { code: 'invalid_credentials', message: 'x' } }), {
      status: 401,
    });
    await failureOf(login('http://localhost:3000', { username: 'a', password: 'b' }));
    expect(handler).not.toHaveBeenCalled();
  });
});

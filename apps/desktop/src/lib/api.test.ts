import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  fetchAttachment,
  fetchMe,
  listChannels,
  login,
  onUnauthorized,
  sendMessage,
} from './api';

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

  it('maps the upload errors to their codes', async () => {
    respond(JSON.stringify({ error: { code: 'payload_too_large', message: 'x' } }), {
      status: 413,
    });
    const tooLarge = await failureOf(
      sendMessage('http://localhost:3000', 't', 'c', '', [new File(['x'], 'a.png')]),
    );
    expect(tooLarge).toMatchObject({ code: 'payload_too_large', status: 413 });

    respond(JSON.stringify({ error: { code: 'unsupported_type', message: 'x' } }), {
      status: 415,
    });
    const refused = await failureOf(
      sendMessage('http://localhost:3000', 't', 'c', '', [new File(['x'], 'a.exe')]),
    );
    expect(refused).toMatchObject({ code: 'unsupported_type', status: 415 });
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

describe('sendMessage', () => {
  const created = { message: { id: 'm' } };

  it('sends a text-only message as JSON', async () => {
    respond(JSON.stringify(created), { status: 201 });
    await sendMessage('http://localhost:3000', 'tok', 'chan', 'bonjour');
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('http://localhost:3000/api/channels/chan/messages');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe(JSON.stringify({ content: 'bonjour' }));
  });

  it('sends files as a multipart form, leaving the boundary to the browser', async () => {
    respond(JSON.stringify(created), { status: 201 });
    const photo = new File(['png'], 'photo.png', { type: 'image/png' });
    const notes = new File(['txt'], 'notes.txt', { type: 'text/plain' });
    await sendMessage('http://localhost:3000', 'tok', 'chan', 'voir', [photo, notes]);

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    // Setting Content-Type by hand would drop the boundary and break the upload.
    expect(headers.get('Content-Type')).toBeNull();
    expect(headers.get('Authorization')).toBe('Bearer tok');

    const form = init?.body;
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get('content')).toBe('voir');
    const sent = (form as FormData).getAll('files') as File[];
    expect(sent.map((file) => file.name)).toEqual(['photo.png', 'notes.txt']);
  });

  it('does not use the short JSON timeout for an upload', async () => {
    vi.useFakeTimers();
    try {
      // A server that answers after 30 s: far beyond the 10 s of ordinary requests.
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise<Response>((resolve, reject) => {
              init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
              setTimeout(
                () => resolve(new Response(JSON.stringify(created), { status: 201 })),
                30_000,
              );
            }),
        ),
      );
      const pending = sendMessage('http://localhost:3000', 't', 'c', 'x', [
        new File(['x'], 'a.png'),
      ]);
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(pending).resolves.toEqual(created);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchAttachment', () => {
  it('returns the bytes, authenticated with the token', async () => {
    respond('file-bytes', { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    const blob = await fetchAttachment('http://localhost:3000', 'tok', 'att 1');

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('http://localhost:3000/api/attachments/att%201');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
    expect(await blob.text()).toBe('file-bytes');
  });

  it('maps a 404 to `not_found`', async () => {
    respond(JSON.stringify({ error: { code: 'not_found', message: 'x' } }), { status: 404 });
    expect(await failureOf(fetchAttachment('http://localhost:3000', 't', 'a'))).toMatchObject({
      code: 'not_found',
      status: 404,
    });
  });

  it('reports an unreachable server as `network`', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect((await failureOf(fetchAttachment('http://localhost:3000', 't', 'a'))).code).toBe(
      'network',
    );
  });

  it('notifies the session handler when the token is refused', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    respond(JSON.stringify({ error: { code: 'unauthorized', message: 'x' } }), { status: 401 });
    await failureOf(fetchAttachment('http://localhost:3000', 'expired', 'a'));
    expect(handler).toHaveBeenCalledOnce();
  });
});

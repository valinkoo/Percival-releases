import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  addChannelMember,
  changePassword,
  fetchAttachment,
  fetchMe,
  listChannels,
  listUsers,
  login,
  onUnauthorized,
  removeChannelMember,
  resetUserPassword,
  sendMessage,
  updateChannel,
  updateUser,
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

describe('sessions ended by the server', () => {
  it('tells the handler a session expired or that the account was disabled', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);

    respond(JSON.stringify({ error: { code: 'unauthorized', message: 'x' } }), { status: 401 });
    await failureOf(fetchMe('http://localhost:3000', 'closed'));
    respond(JSON.stringify({ error: { code: 'account_disabled', message: 'x' } }), {
      status: 403,
    });
    await failureOf(fetchMe('http://localhost:3000', 'old'));

    expect(handler.mock.calls).toEqual([['expired'], ['disabled']]);
  });

  it('only reports a disabled account when the answer is about a signed-in session', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    respond(JSON.stringify({ error: { code: 'account_disabled', message: 'x' } }), {
      status: 403,
    });
    const error = await failureOf(login('http://localhost:3000', { username: 'a', password: 'b' }));
    expect(error.code).toBe('account_disabled');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not take a wrong current password for an expired session', async () => {
    const handler = vi.fn();
    onUnauthorized(handler);
    respond(JSON.stringify({ error: { code: 'invalid_credentials', message: 'x' } }), {
      status: 403,
    });
    const error = await failureOf(
      changePassword('http://localhost:3000', 'tok', { currentPassword: 'a', newPassword: 'b' }),
    );
    expect(error).toMatchObject({ code: 'invalid_credentials', status: 403 });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('administration calls', () => {
  const lastCall = () => {
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    return { url, init, headers: new Headers(init?.headers) };
  };

  it('changes one’s own password with a JSON POST', async () => {
    respond(JSON.stringify({ token: 'new' }), { status: 200 });
    await changePassword('http://localhost:3000', 'tok', {
      currentPassword: 'old-password-1',
      newPassword: 'new-password-2',
    });
    const { url, init, headers } = lastCall();
    expect(url).toBe('http://localhost:3000/api/auth/password');
    expect(init?.method).toBe('POST');
    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(init?.body).toBe(
      JSON.stringify({ currentPassword: 'old-password-1', newPassword: 'new-password-2' }),
    );
  });

  it('lists accounts, changes a role or state with PATCH and resets a password', async () => {
    respond(JSON.stringify({ users: [] }), { status: 200 });
    await listUsers('http://localhost:3000', 'tok');
    expect(lastCall().url).toBe('http://localhost:3000/api/users');

    respond(JSON.stringify({ user: {} }), { status: 200 });
    await updateUser('http://localhost:3000', 'tok', 'u 1', { role: 'guest', active: false });
    let call = lastCall();
    expect(call.url).toBe('http://localhost:3000/api/users/u%201');
    expect(call.init?.method).toBe('PATCH');
    expect(call.init?.body).toBe(JSON.stringify({ role: 'guest', active: false }));

    respond(JSON.stringify({ user: {} }), { status: 200 });
    await resetUserPassword('http://localhost:3000', 'tok', 'u1', 'Temporary-Pass-1');
    call = lastCall();
    expect(call.url).toBe('http://localhost:3000/api/users/u1/password');
    expect(call.init?.body).toBe(JSON.stringify({ password: 'Temporary-Pass-1' }));
  });

  it('renames a channel with PATCH', async () => {
    respond(JSON.stringify({ channel: {} }), { status: 200 });
    await updateChannel('http://localhost:3000', 'tok', 'c1', { name: 'neuf', description: '' });
    const { url, init } = lastCall();
    expect(url).toBe('http://localhost:3000/api/channels/c1');
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe(JSON.stringify({ name: 'neuf', description: '' }));
  });

  it('adds and removes members without a body, so no JSON content type is sent', async () => {
    respond(JSON.stringify({ members: [], candidates: [] }), { status: 200 });
    await addChannelMember('http://localhost:3000', 'tok', 'c1', 'u1');
    let call = lastCall();
    expect(call.url).toBe('http://localhost:3000/api/channels/c1/members/u1');
    expect(call.init?.method).toBe('PUT');
    expect(call.init?.body).toBeUndefined();
    expect(call.headers.get('Content-Type')).toBeNull();

    respond(JSON.stringify({ members: [], candidates: [] }), { status: 200 });
    await removeChannelMember('http://localhost:3000', 'tok', 'c1', 'u1');
    call = lastCall();
    expect(call.url).toBe('http://localhost:3000/api/channels/c1/members/u1');
    expect(call.init?.method).toBe('DELETE');
    expect(call.headers.get('Content-Type')).toBeNull();
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

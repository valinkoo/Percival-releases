import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_NAME_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
  type ApiErrorBody,
  type EditMessageResponse,
  type MessagesPageResponse,
  type SendMessageResponse,
} from '@percival/shared';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sanitizeFileName } from '../src/attachments/storage.js';
import { contentDisposition } from '../src/routes/attachments.js';
import {
  authHeader,
  createTestContext,
  createUser,
  tokenFor,
  type TestContext,
} from './helpers/app.js';
import {
  EXE,
  JPEG,
  multipartBody,
  PDF,
  PNG,
  SVG,
  TEXT,
  ZIP,
  type FilePart,
} from './helpers/files.js';

describe('attachments', () => {
  let ctx: TestContext;
  let generalId: string;
  let privateId: string;
  let alice: { id: string; token: string };
  let bob: { id: string; token: string };
  let guest: { id: string; token: string };

  beforeAll(async () => {
    ctx = await createTestContext();
    const a = await createUser(ctx.prisma, 'alice', 'admin');
    const b = await createUser(ctx.prisma, 'bob', 'member');
    const g = await createUser(ctx.prisma, 'guest', 'guest');
    alice = { id: a.id, token: tokenFor(ctx.app, a.id) };
    bob = { id: b.id, token: tokenFor(ctx.app, b.id) };
    guest = { id: g.id, token: tokenFor(ctx.app, g.id) };

    generalId = (await ctx.prisma.channel.findFirstOrThrow({ where: { name: 'general' } })).id;
    privateId = (await ctx.prisma.channel.create({ data: { name: 'secret', isPrivate: true } })).id;
    await ctx.prisma.channelMember.create({ data: { channelId: privateId, userId: alice.id } });
  });
  afterAll(async () => ctx.close());

  /** Files currently stored on disk (relative paths). */
  async function storedFiles(): Promise<string[]> {
    const entries = await readdir(ctx.config.UPLOADS_DIR, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name));
  }

  async function upload(
    token: string | null,
    channelId: string,
    fields: Record<string, string>,
    files: FilePart[],
  ) {
    const { payload, headers } = await multipartBody(fields, files);
    return ctx.app.inject({
      method: 'POST',
      url: `/api/channels/${channelId}/messages`,
      headers: { ...headers, ...(token ? authHeader(token) : {}) },
      payload,
    });
  }

  const download = (token: string | null, attachmentId: string) =>
    ctx.app.inject({
      method: 'GET',
      url: `/api/attachments/${attachmentId}`,
      headers: token ? authHeader(token) : {},
    });

  const errorCode = (response: LightMyRequestResponse) => response.json<ApiErrorBody>().error.code;

  async function sendFile(token: string, file: FilePart, content = 'voir le fichier') {
    const response = await upload(token, generalId, { content }, [file]);
    expect(response.statusCode).toBe(201);
    const { message } = response.json<SendMessageResponse>();
    const attachment = message.attachments[0];
    if (!attachment) throw new Error('The message has no attachment');
    return { message, attachment };
  }

  describe('sending a message with files', () => {
    it('keeps a text-only message working, with an empty attachment list', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: `/api/channels/${generalId}/messages`,
        headers: authHeader(alice.token),
        payload: { content: 'bonjour' },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json<SendMessageResponse>().message.attachments).toEqual([]);
    });

    it('stores the file under a generated name and records it in the database', async () => {
      const before = (await storedFiles()).length;
      const { message, attachment } = await sendFile(alice.token, {
        name: 'Capture d’écran.png',
        data: PNG,
      });

      expect(message.content).toBe('voir le fichier');
      expect(attachment).toMatchObject({
        fileName: 'Capture d’écran.png',
        fileType: 'image/png',
        fileSize: PNG.length,
      });

      const row = await ctx.prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
      expect(row.messageId).toBe(message.id);
      // The path is generated: it never contains the name sent by the client.
      expect(row.filePath).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
      const bytes = await readFile(path.join(ctx.config.UPLOADS_DIR, row.filePath));
      expect(bytes.equals(PNG)).toBe(true);
      expect(await storedFiles()).toHaveLength(before + 1);
    });

    it('accepts a message made of a file only', async () => {
      const { message } = await sendFile(alice.token, { name: 'notes.txt', data: TEXT }, '');
      expect(message.content).toBe('');
      expect(message.attachments[0]?.fileType).toBe('text/plain');
    });

    it('keeps several files in upload order', async () => {
      const response = await upload(alice.token, generalId, { content: 'trois' }, [
        { name: 'a.png', data: PNG },
        { name: 'b.pdf', data: PDF },
        { name: 'c.jpg', data: JPEG },
      ]);
      expect(response.statusCode).toBe(201);
      const { message } = response.json<SendMessageResponse>();
      expect(message.attachments.map((file) => file.fileName)).toEqual(['a.png', 'b.pdf', 'c.jpg']);
      expect(message.attachments.map((file) => file.fileType)).toEqual([
        'image/png',
        'application/pdf',
        'image/jpeg',
      ]);

      const history = await ctx.app.inject({
        method: 'GET',
        url: `/api/channels/${generalId}/messages`,
        headers: authHeader(bob.token),
      });
      const stored = history
        .json<MessagesPageResponse>()
        .messages.find((candidate) => candidate.id === message.id);
      expect(stored?.attachments).toEqual(message.attachments);
    });

    it('accepts an archive', async () => {
      const { attachment } = await sendFile(alice.token, { name: 'sauvegarde.zip', data: ZIP });
      expect(attachment.fileType).toBe('application/zip');
    });

    it('decides the type from the content, not from the declared type or the name', async () => {
      const { attachment } = await sendFile(alice.token, {
        name: 'photo.pdf',
        data: JPEG,
        declaredType: 'application/pdf',
      });
      expect(attachment.fileType).toBe('image/jpeg');
    });

    it('refuses a message with neither text nor file', async () => {
      const response = await upload(alice.token, generalId, { content: '   ' }, []);
      expect(response.statusCode).toBe(400);
      expect(errorCode(response)).toBe('invalid_request');
    });

    it('refuses text that is too long and leaves no file behind', async () => {
      const before = await storedFiles();
      const response = await upload(
        alice.token,
        generalId,
        { content: 'x'.repeat(MESSAGE_MAX_LENGTH + 1) },
        [{ name: 'a.png', data: PNG }],
      );
      expect(response.statusCode).toBe(400);
      expect(await storedFiles()).toEqual(before);
    });

    it('refuses a file sent under another field name', async () => {
      const before = await storedFiles();
      const response = await upload(alice.token, generalId, { content: 'x' }, [
        { name: 'a.png', data: PNG, field: 'avatar' },
      ]);
      expect(response.statusCode).toBe(400);
      expect(await storedFiles()).toEqual(before);
    });
  });

  describe('refused files', () => {
    async function expectRefused(file: FilePart, status: number, code: string) {
      const before = await storedFiles();
      const messagesBefore = await ctx.prisma.message.count();
      const response = await upload(alice.token, generalId, { content: 'x' }, [file]);
      expect(response.statusCode).toBe(status);
      expect(errorCode(response)).toBe(code);
      // Nothing is kept: no file on disk, no message, no attachment.
      expect(await storedFiles()).toEqual(before);
      expect(await ctx.prisma.message.count()).toBe(messagesBefore);
    }

    it('refuses a program, even when it is named like an image', async () => {
      await expectRefused({ name: 'setup.exe', data: EXE }, 415, 'unsupported_type');
      await expectRefused(
        { name: 'photo.png', data: EXE, declaredType: 'image/png' },
        415,
        'unsupported_type',
      );
    });

    it('refuses SVG and HTML, which can run scripts', async () => {
      await expectRefused(
        { name: 'logo.svg', data: SVG, declaredType: 'image/svg+xml' },
        415,
        'unsupported_type',
      );
      await expectRefused(
        { name: 'page.html', data: Buffer.from('<h1>x</h1>'), declaredType: 'text/html' },
        415,
        'unsupported_type',
      );
    });

    it('refuses binary data named like a text file', async () => {
      await expectRefused(
        { name: 'notes.txt', data: Buffer.from([0x01, 0x00, 0x02, 0xff, 0xfe]) },
        415,
        'unsupported_type',
      );
    });

    it('refuses an unknown format', async () => {
      await expectRefused(
        { name: 'data.bin', data: Buffer.from('whatever') },
        415,
        'unsupported_type',
      );
    });

    it('refuses an empty file', async () => {
      await expectRefused({ name: 'vide.txt', data: Buffer.alloc(0) }, 400, 'invalid_request');
    });

    it('refuses a file over the size limit', async () => {
      const tooBig = Buffer.concat([PNG, Buffer.alloc(ATTACHMENT_MAX_BYTES)]);
      await expectRefused({ name: 'enorme.png', data: tooBig }, 413, 'payload_too_large');
    });

    it('accepts a file just under the size limit', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(ATTACHMENT_MAX_BYTES - PNG.length)]);
      const { attachment } = await sendFile(alice.token, { name: 'grande.png', data: big });
      expect(attachment.fileSize).toBe(ATTACHMENT_MAX_BYTES);
    });

    it('refuses too many files at once', async () => {
      const before = await storedFiles();
      const files = Array.from({ length: 6 }, (_, index) => ({
        name: `${index}.png`,
        data: PNG,
      }));
      const response = await upload(alice.token, generalId, { content: 'x' }, files);
      expect(response.statusCode).toBe(413);
      expect(errorCode(response)).toBe('payload_too_large');
      expect(await storedFiles()).toEqual(before);
    });

    it('removes the files of the batch when one of them is refused', async () => {
      const before = await storedFiles();
      const response = await upload(alice.token, generalId, { content: 'x' }, [
        { name: 'ok.png', data: PNG },
        { name: 'bad.exe', data: EXE },
      ]);
      expect(response.statusCode).toBe(415);
      expect(await storedFiles()).toEqual(before);
    });
  });

  describe('who can upload', () => {
    it('requires authentication', async () => {
      const before = await storedFiles();
      const response = await upload(null, generalId, { content: 'x' }, [
        { name: 'a.png', data: PNG },
      ]);
      expect(response.statusCode).toBe(401);
      expect(await storedFiles()).toEqual(before);
    });

    it('writes nothing for a channel the account cannot see', async () => {
      const before = await storedFiles();
      for (const account of [bob, guest]) {
        const response = await upload(account.token, privateId, { content: 'x' }, [
          { name: 'a.png', data: PNG },
        ]);
        expect(response.statusCode).toBe(404);
      }
      expect(await storedFiles()).toEqual(before);
    });

    it('answers 404 for an unknown channel', async () => {
      const response = await upload(
        alice.token,
        '00000000-0000-4000-8000-000000000000',
        { content: 'x' },
        [{ name: 'a.png', data: PNG }],
      );
      expect(response.statusCode).toBe(404);
    });
  });

  describe('downloading', () => {
    it('serves the file to someone who can see the channel, as a download', async () => {
      const { attachment } = await sendFile(alice.token, { name: 'Résumé été.pdf', data: PDF });
      const response = await download(bob.token, attachment.id);

      expect(response.statusCode).toBe(200);
      expect(response.rawPayload.equals(PDF)).toBe(true);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-length']).toBe(String(PDF.length));
      expect(response.headers['content-disposition']).toBe(
        `attachment; filename="R_sum_ _t_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%C3%A9t%C3%A9.pdf`,
      );
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it('requires authentication', async () => {
      const { attachment } = await sendFile(alice.token, { name: 'a.png', data: PNG });
      const response = await download(null, attachment.id);
      expect(response.statusCode).toBe(401);
    });

    it('is a 404 for an account that cannot see the channel', async () => {
      const response = await upload(alice.token, privateId, { content: 'secret' }, [
        { name: 'plan.pdf', data: PDF },
      ]);
      const attachment = response.json<SendMessageResponse>().message.attachments[0];
      expect(attachment).toBeDefined();
      const id = attachment?.id ?? '';

      expect((await download(alice.token, id)).statusCode).toBe(200);
      expect((await download(bob.token, id)).statusCode).toBe(404);
      expect((await download(guest.token, id)).statusCode).toBe(404);
    });

    it('is a 404 once the message is deleted', async () => {
      const { message, attachment } = await sendFile(bob.token, { name: 'a.png', data: PNG });
      expect((await download(alice.token, attachment.id)).statusCode).toBe(200);

      const removed = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/channels/${generalId}/messages/${message.id}`,
        headers: authHeader(bob.token),
      });
      expect(removed.statusCode).toBe(200);
      expect((await download(alice.token, attachment.id)).statusCode).toBe(404);
      expect((await download(bob.token, attachment.id)).statusCode).toBe(404);
    });

    it('is a 404 for an unknown id and a 400 for a malformed one', async () => {
      expect((await download(alice.token, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(
        404,
      );
      expect((await download(alice.token, 'not-a-uuid')).statusCode).toBe(400);
    });

    it('is a 404 when the file is missing on disk', async () => {
      const { attachment } = await sendFile(alice.token, { name: 'a.png', data: PNG });
      const row = await ctx.prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
      await rm(path.join(ctx.config.UPLOADS_DIR, row.filePath));
      expect((await download(alice.token, attachment.id)).statusCode).toBe(404);
    });
  });

  describe('editing a message that has files', () => {
    const edit = (token: string, messageId: string, content: string) =>
      ctx.app.inject({
        method: 'PATCH',
        url: `/api/channels/${generalId}/messages/${messageId}`,
        headers: authHeader(token),
        payload: { content },
      });

    it('keeps the files and lets the text become empty', async () => {
      const { message, attachment } = await sendFile(alice.token, { name: 'a.png', data: PNG });

      const response = await edit(alice.token, message.id, '');
      expect(response.statusCode).toBe(200);
      const edited = response.json<EditMessageResponse>().message;
      expect(edited.content).toBe('');
      expect(edited.attachments).toEqual([attachment]);
    });

    it('still refuses an empty text on a message without files', async () => {
      const created = await ctx.app.inject({
        method: 'POST',
        url: `/api/channels/${generalId}/messages`,
        headers: authHeader(alice.token),
        payload: { content: 'texte' },
      });
      const { message } = created.json<SendMessageResponse>();
      const response = await edit(alice.token, message.id, '  ');
      expect(response.statusCode).toBe(400);
      expect(errorCode(response)).toBe('invalid_request');
    });
  });
});

describe('sanitizeFileName', () => {
  it('keeps an ordinary name, accents and spaces included', () => {
    expect(sanitizeFileName('Compte rendu été.docx')).toBe('Compte rendu été.docx');
  });

  it('drops any directory part', () => {
    expect(sanitizeFileName('../../etc/passwd.txt')).toBe('passwd.txt');
    expect(sanitizeFileName('C:\\Users\\moi\\notes.txt')).toBe('notes.txt');
  });

  it('replaces characters Windows refuses and control characters', () => {
    expect(sanitizeFileName('a<b>c:d"e|f?g*h.txt')).toBe('a_b_c_d_e_f_g_h.txt');
    expect(sanitizeFileName('ligne\nbreak\u0000.txt')).toBe('ligne_break_.txt');
  });

  it('trims spaces and dots at both ends, and never returns an empty name', () => {
    expect(sanitizeFileName('  .. nom .. ')).toBe('nom');
    expect(sanitizeFileName('...')).toBe('fichier');
    expect(sanitizeFileName('')).toBe('fichier');
    expect(sanitizeFileName('dossier/')).toBe('fichier');
  });

  it('shortens a long name but keeps its extension', () => {
    const name = sanitizeFileName(`${'a'.repeat(500)}.pdf`);
    expect(name).toHaveLength(ATTACHMENT_NAME_MAX_LENGTH);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});

describe('contentDisposition', () => {
  it('is always an attachment, with an ASCII fallback and the real name encoded', () => {
    expect(contentDisposition('plan "final".pdf')).toBe(
      `attachment; filename="plan _final_.pdf"; filename*=UTF-8''plan%20%22final%22.pdf`,
    );
  });

  it('encodes the characters encodeURIComponent leaves alone', () => {
    expect(contentDisposition("l'été (1).txt")).toContain(
      "filename*=UTF-8''l%27%C3%A9t%C3%A9%20%281%29.txt",
    );
  });
});

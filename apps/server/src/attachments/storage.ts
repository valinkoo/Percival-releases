import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_NAME_MAX_LENGTH } from '@percival/shared';
import { AppError } from '../errors.js';
import { detectAttachmentType } from './types.js';

/** A file written to the uploads directory, not yet linked to a message. */
export interface StoredFile {
  /** Path relative to the uploads directory (server-generated, never derived from the name). */
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

/** Characters Windows refuses in a file name, plus the control characters. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_IN_NAME = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;

/**
 * Cleans an uploaded file name for display and download: no directory part, no control or reserved
 * characters, at most `ATTACHMENT_NAME_MAX_LENGTH` characters (the extension is kept).
 */
export function sanitizeFileName(raw: string): string {
  // Browsers send a bare name, but some clients send a full path: keep the last segment only.
  const base = raw.split(/[/\\]/).pop() ?? '';
  const cleaned = base
    .normalize('NFC')
    .replace(FORBIDDEN_IN_NAME, '_')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  if (cleaned === '') return 'fichier';
  if (cleaned.length <= ATTACHMENT_NAME_MAX_LENGTH) return cleaned;

  const extension = path.extname(cleaned);
  const keep = ATTACHMENT_NAME_MAX_LENGTH - extension.length;
  return extension.length > 0 && extension.length < 20
    ? `${cleaned.slice(0, keep)}${extension}`
    : cleaned.slice(0, ATTACHMENT_NAME_MAX_LENGTH);
}

/** Absolute path of a stored file. Refuses anything that would leave the uploads directory. */
export function uploadPath(root: string, filePath: string): string {
  const base = path.resolve(root);
  const absolute = path.resolve(base, filePath);
  if (!absolute.startsWith(base + path.sep)) {
    throw new Error('Upload path escapes the uploads directory');
  }
  return absolute;
}

/** Deletes stored files. Missing files are ignored: this is cleanup, it must not fail. */
export async function removeUploads(root: string, files: readonly { filePath: string }[]) {
  await Promise.all(files.map((file) => rm(uploadPath(root, file.filePath), { force: true })));
}

/** The part of a multipart file stream this module relies on. */
type UploadStream = Readable & { truncated?: boolean };

/**
 * Writes an uploaded file to disk and checks it. The name and the declared MIME type sent by the
 * client are never trusted: the file lands under a generated name and its type is read from its
 * content. A refused file leaves nothing behind.
 */
export async function saveUpload(
  root: string,
  stream: UploadStream,
  rawName: string,
): Promise<StoredFile> {
  const fileName = sanitizeFileName(rawName);
  const now = new Date();
  const filePath = path.posix.join(
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    randomUUID(),
  );
  const absolute = uploadPath(root, filePath);
  await mkdir(path.dirname(absolute), { recursive: true });

  try {
    await pipeline(stream, createWriteStream(absolute, { flags: 'wx' }));
    if (stream.truncated) {
      throw new AppError(413, 'payload_too_large', 'File too large');
    }
    const { size } = await stat(absolute);
    if (size === 0) {
      throw new AppError(400, 'invalid_request', 'The file is empty');
    }
    if (size > ATTACHMENT_MAX_BYTES) {
      throw new AppError(413, 'payload_too_large', 'File too large');
    }
    const fileType = await detectAttachmentType(absolute, fileName);
    if (!fileType) {
      throw new AppError(415, 'unsupported_type', 'This type of file is not allowed');
    }
    return { filePath, fileName, fileType, fileSize: size };
  } catch (error) {
    await rm(absolute, { force: true });
    throw error;
  }
}

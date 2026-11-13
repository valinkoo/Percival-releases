import { open } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';

/**
 * MIME types accepted for attachments (DAT: allowlist). Anything else is refused with a 415.
 * Deliberately absent: SVG, HTML, scripts and executables (they can run code when opened), and the
 * legacy Office formats (.doc, .xls, .ppt, which can carry macros).
 */
export const ALLOWED_ATTACHMENT_TYPES: ReadonlySet<string> = new Set([
  // Images (the first four are previewed inline by the client)
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  // Archives
  'application/zip',
  'application/x-7z-compressed',
  // Audio and video
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/vnd.wave',
  'audio/flac',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

/** Text formats have no signature: they are recognised by their extension, then checked. */
const TEXT_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = {
  txt: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
};

/** How much of a text file is inspected to make sure it really is text. */
const TEXT_CHECK_BYTES = 64 * 1024;

/** True when the bytes look like UTF-8 text: no NUL byte and valid sequences. */
function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    // `stream` tolerates a multi-byte character cut by the end of the inspected block.
    new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true });
    return true;
  } catch {
    return false;
  }
}

async function readHead(filePath: string): Promise<Uint8Array> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(TEXT_CHECK_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, TEXT_CHECK_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * The MIME type of a stored file, or `null` when it is not an allowed type.
 *
 * The type is decided from the content (magic bytes), never from what the uploader declared: a
 * program renamed `photo.png` is detected as a program and refused. Only plain text formats fall
 * back on the file name, and then the content must really be text.
 */
export async function detectAttachmentType(
  filePath: string,
  fileName: string,
): Promise<string | null> {
  const detected = await fileTypeFromFile(filePath);
  if (detected) {
    return ALLOWED_ATTACHMENT_TYPES.has(detected.mime) ? detected.mime : null;
  }

  const textType = TEXT_TYPES_BY_EXTENSION[path.extname(fileName).slice(1).toLowerCase()];
  if (textType && looksLikeText(await readHead(filePath))) {
    return textType;
  }
  return null;
}

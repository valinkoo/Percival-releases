import { MESSAGE_MAX_LENGTH } from '@percival/shared';
import type { FastifyRequest } from 'fastify';
import { removeUploads, saveUpload, type StoredFile } from '../attachments/storage.js';
import { AppError } from '../errors.js';

export interface MessageForm {
  /** The text, trimmed at the end. May be empty: the caller decides whether files make up for it. */
  content: string;
  files: StoredFile[];
}

/** Name of the multipart part that carries each file. */
export const FILE_FIELD = 'files';

/**
 * Reads a `multipart/form-data` message: a `content` text field and `files` parts. The files are
 * streamed to the uploads directory as they arrive and checked one by one; if anything fails, the
 * ones already written are deleted. Limits (size, number of files) are enforced by the multipart
 * plugin, see `app.ts`.
 */
export async function readMessageForm(
  request: FastifyRequest,
  uploadsDir: string,
): Promise<MessageForm> {
  const files: StoredFile[] = [];
  let content = '';
  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== FILE_FIELD) {
          throw new AppError(400, 'invalid_request', `Unexpected file field "${part.fieldname}"`);
        }
        files.push(await saveUpload(uploadsDir, part.file, part.filename));
      } else if (part.fieldname === 'content' && typeof part.value === 'string') {
        content = part.value;
      }
      // Other text fields are ignored.
    }
    if (content.length > MESSAGE_MAX_LENGTH) {
      throw new AppError(
        400,
        'invalid_request',
        `content: at most ${MESSAGE_MAX_LENGTH} characters`,
      );
    }
  } catch (error) {
    await removeUploads(uploadsDir, files);
    throw error;
  }
  return { content: content.trimEnd(), files };
}

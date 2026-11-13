import type { AttachmentDto } from '@percival/shared';
import * as api from './api';
import { saveBlob } from './download';
import { errorMessage } from './messages';
import { session } from './session.svelte';

/** The bytes of an attachment, fetched with the session token. Throws an `ApiError`. */
export function fetchAttachmentBlob(attachment: AttachmentDto): Promise<Blob> {
  const token = session.token;
  if (!token) return Promise.reject(new api.ApiError('unauthorized', 401));
  return api.fetchAttachment(session.serverUrl, token, attachment.id);
}

/** Downloads an attachment to disk. Returns a French error message, or `null` on success. */
export async function saveAttachment(attachment: AttachmentDto): Promise<string | null> {
  try {
    saveBlob(await fetchAttachmentBlob(attachment), attachment.fileName);
    return null;
  } catch (error) {
    return errorMessage(error);
  }
}

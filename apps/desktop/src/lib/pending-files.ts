import { ATTACHMENTS_PER_MESSAGE_MAX, ATTACHMENT_MAX_BYTES } from '@percival/shared';
import { formatFileSize } from './format';

export interface PendingFilesResult {
  /** The files that will be sent: the previous ones plus the accepted new ones. */
  files: File[];
  /** One French sentence per refused file (or one for the limit on their number). */
  problems: string[];
}

function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/**
 * Adds files picked, dropped or pasted by the user to those waiting to be sent, within the limits
 * the server enforces (size, number). It only gives early feedback: the server decides the type
 * and has the last word on everything else.
 */
export function addPendingFiles(
  current: readonly File[],
  incoming: readonly File[],
): PendingFilesResult {
  const files = [...current];
  const problems: string[] = [];
  let overLimit = false;

  for (const file of incoming) {
    if (files.some((existing) => sameFile(existing, file))) continue; // Already in the list.
    if (file.size === 0) {
      problems.push(`« ${file.name} » est vide.`);
    } else if (file.size > ATTACHMENT_MAX_BYTES) {
      problems.push(
        `« ${file.name} » (${formatFileSize(file.size)}) dépasse la limite de ${formatFileSize(ATTACHMENT_MAX_BYTES)}.`,
      );
    } else if (files.length >= ATTACHMENTS_PER_MESSAGE_MAX) {
      overLimit = true;
    } else {
      files.push(file);
    }
  }
  if (overLimit) {
    problems.push(`${ATTACHMENTS_PER_MESSAGE_MAX} fichiers au maximum par message.`);
  }
  return { files, problems };
}

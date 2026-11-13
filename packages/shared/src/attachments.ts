/** A file attached to a message. The bytes are fetched on demand from `GET /api/attachments/:id`. */
export interface AttachmentDto {
  id: string;
  /** Original name, cleaned by the server (no path, no control characters). */
  fileName: string;
  /**
   * MIME type decided by the server from the file's content, always one of the allowed types.
   * It is not the type the uploader declared.
   */
  fileType: string;
  /** Size in bytes. */
  fileSize: number;
}

/**
 * Extensions offered by the file picker. Only a hint to the user: the server decides what is
 * accepted from the content of each file, whatever its name.
 */
export const ATTACHMENT_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'pdf',
  'txt',
  'md',
  'csv',
  'json',
  'log',
  'docx',
  'xlsx',
  'pptx',
  'odt',
  'ods',
  'odp',
  'zip',
  '7z',
  'mp3',
  'ogg',
  'wav',
  'flac',
  'mp4',
  'webm',
  'mov',
];

/** Image types the client displays inline. Other attachments are shown as a file to download. */
export const PREVIEWABLE_IMAGE_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

export function isPreviewableImage(fileType: string): boolean {
  return PREVIEWABLE_IMAGE_TYPES.includes(fileType);
}

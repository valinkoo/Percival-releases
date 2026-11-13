import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { uploadPath } from '../attachments/storage.js';
import { accessibleChannelsWhere } from '../channels/access.js';
import { AppError } from '../errors.js';

const paramsSchema = z.object({ attachmentId: z.uuid() });

/**
 * `Content-Disposition` for a download: a plain ASCII fallback for old clients plus the real name
 * in the RFC 5987 form. Always `attachment`: this API never asks a browser to render a file.
 */
export function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export const attachmentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);

  /**
   * Authenticated download. The file is served only to someone who can see the channel of its
   * message, and not once the message is deleted. Every failure is the same 404, so the endpoint
   * does not reveal which attachment ids exist.
   */
  app.get('/:attachmentId', async (request, reply) => {
    const { attachmentId } = paramsSchema.parse(request.params);
    const attachment = await app.prisma.attachment.findFirst({
      where: {
        id: attachmentId,
        message: { deletedAt: null, channel: accessibleChannelsWhere(request.account) },
      },
    });
    if (!attachment) {
      throw new AppError(404, 'not_found', 'File not found');
    }

    const absolute = uploadPath(app.config.UPLOADS_DIR, attachment.filePath);
    let size: number;
    try {
      size = (await stat(absolute)).size;
    } catch {
      request.log.error({ attachmentId }, 'Attachment is in the database but not on disk');
      throw new AppError(404, 'not_found', 'File not found');
    }

    return (
      reply
        .header('Content-Type', attachment.fileType)
        .header('Content-Length', size)
        .header('Content-Disposition', contentDisposition(attachment.fileName))
        // Access is checked on every request; nothing is kept by intermediaries or the WebView.
        .header('Cache-Control', 'private, no-store')
        .send(createReadStream(absolute))
    );
  });
};

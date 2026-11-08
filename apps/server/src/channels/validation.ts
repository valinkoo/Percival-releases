import { CHANNEL_DESCRIPTION_MAX_LENGTH, CHANNEL_NAME_MAX_LENGTH } from '@percival/shared';
import { z } from 'zod';

/**
 * Channel names are lowercase, without spaces: "Projet Client 1" becomes "projet-client-1".
 * Letters (accents included), digits, "-" and "_" are allowed.
 */
export const channelNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((name) => name.replace(/\s+/g, '-'))
  .pipe(
    z
      .string()
      .min(1)
      .max(CHANNEL_NAME_MAX_LENGTH)
      .regex(/^[\p{L}\p{N}_-]+$/u, 'only letters, digits, "-" and "_" are allowed'),
  );

export const channelDescriptionSchema = z.string().trim().max(CHANNEL_DESCRIPTION_MAX_LENGTH);

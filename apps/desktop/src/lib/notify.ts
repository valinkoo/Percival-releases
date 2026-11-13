import { inTauri } from './tauri';

/** Roughly what a Markdown message says, without its formatting, for a notification. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n?/g, '') // code fence lines
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images keep their alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links keep their label
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '') // heading, quote and list markers
    .replace(/[*_~`]+/g, '') // emphasis and inline code markers
    .replace(/\s+/g, ' ')
    .trim();
}

/** The notification text: plain, on one line, cut at `max` characters. */
export function notificationBody(markdown: string, max = 140): string {
  const text = plainText(markdown);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** What a message made of files says in a notification: the file name, or how many files. */
export function attachmentSummary(attachments: readonly { fileName: string }[]): string {
  const [first] = attachments;
  if (!first) return '';
  return attachments.length === 1
    ? `📎 ${first.fileName}`
    : `📎 ${attachments.length} fichiers joints`;
}

/**
 * Shows a native Windows notification. Does nothing outside the Tauri shell, and never throws:
 * a missing permission or a notification failure must not disturb the chat.
 */
export async function showNotification(title: string, body: string): Promise<void> {
  if (!inTauri) return;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import('@tauri-apps/plugin-notification');
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (granted) sendNotification({ title, body });
  } catch {
    // Notifications are a convenience.
  }
}

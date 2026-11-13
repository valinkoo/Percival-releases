const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const fullFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'medium' });

/** "14:32" for today, "08/11/2026 14:32" otherwise. */
export function formatTimestamp(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  return date.toDateString() === now.toDateString()
    ? timeFormat.format(date)
    : dateTimeFormat.format(date);
}

const sizeFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const SIZE_UNITS = ['Ko', 'Mo', 'Go'] as const;

/** "812 o", "1,5 Ko", "24,3 Mo": file sizes the French way (the unit is the octet). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${sizeFormat.format(value)} ${SIZE_UNITS[unit]}`;
}

/** A short word for what a file is, from its MIME type, shown next to its size. */
export function fileKindLabel(fileType: string): string {
  if (fileType === 'application/pdf') return 'PDF';
  if (fileType.startsWith('image/')) return 'Image';
  if (fileType.startsWith('audio/')) return 'Audio';
  if (fileType.startsWith('video/')) return 'Vidéo';
  if (fileType === 'application/zip' || fileType === 'application/x-7z-compressed') {
    return 'Archive';
  }
  if (fileType.startsWith('text/') || fileType === 'application/json') return 'Texte';
  return 'Document';
}

/** Long form, for tooltips. */
export function formatFullDate(iso: string): string {
  return fullFormat.format(new Date(iso));
}

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

/** Long form, for tooltips. */
export function formatFullDate(iso: string): string {
  return fullFormat.format(new Date(iso));
}

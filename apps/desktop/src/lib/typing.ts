/**
 * "Alice est en train d'écrire…" for the people currently typing in a channel
 * (an empty string when nobody is).
 */
export function typingLabel(usernames: string[]): string {
  const names = [...usernames].sort((a, b) => a.localeCompare(b, 'fr'));
  switch (names.length) {
    case 0:
      return '';
    case 1:
      return `${names[0]} est en train d'écrire…`;
    case 2:
      return `${names[0]} et ${names[1]} sont en train d'écrire…`;
    default:
      return "Plusieurs personnes sont en train d'écrire…";
  }
}

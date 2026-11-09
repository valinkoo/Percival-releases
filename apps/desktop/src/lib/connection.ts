import type { ConnectionState } from './realtime';

/** How the connection to the server is described to the user. */
export const CONNECTION_LABELS: Record<ConnectionState, string> = {
  connected: 'Connecté',
  connecting: 'Connexion…',
  offline: 'Reconnexion…',
};

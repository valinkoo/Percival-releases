import { ApiError, type ApiErrorCode } from './api';

/** French messages shown to the user for each API error code. */
const MESSAGES: Record<ApiErrorCode, string> = {
  network:
    "Impossible de joindre le serveur. Vérifiez l'adresse et votre connexion (Tailscale est-il actif ?).",
  invalid_server:
    "Cette adresse ne répond pas comme un serveur Percival. Vérifiez l'adresse et le port.",
  invalid_credentials: "Nom d'utilisateur ou mot de passe incorrect.",
  invalid_request: 'Requête invalide. Vérifiez les informations saisies.',
  unauthorized: 'Votre session a expiré. Reconnectez-vous.',
  forbidden: "Vous n'avez pas le droit d'effectuer cette action.",
  account_disabled: 'Ce compte est désactivé. Contactez un administrateur.',
  password_change_required: "Vous devez d'abord choisir un nouveau mot de passe.",
  not_found: 'Ressource introuvable.',
  conflict: 'Un salon porte déjà ce nom.',
  payload_too_large: 'Fichier trop volumineux (25 Mo maximum par fichier, 5 fichiers par message).',
  unsupported_type:
    "Ce type de fichier n'est pas accepté (images, PDF, documents, archives, audio et vidéo).",
  rate_limited: 'Trop de tentatives. Réessayez dans une minute.',
  internal_error: 'Erreur du serveur. Réessayez plus tard.',
};

/**
 * The French message for an error. A few codes mean different things depending on what was being
 * done (a "conflict" is a channel name taken here, a username there): the caller says so with
 * `overrides`.
 */
export function errorMessage(
  error: unknown,
  overrides: Partial<Record<ApiErrorCode, string>> = {},
): string {
  if (error instanceof ApiError) {
    return overrides[error.code] ?? MESSAGES[error.code];
  }
  return MESSAGES.internal_error;
}

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
  not_found: 'Ressource introuvable.',
  conflict: 'Un salon porte déjà ce nom.',
  payload_too_large: 'Fichier trop volumineux (25 Mo maximum par fichier, 5 fichiers par message).',
  unsupported_type:
    "Ce type de fichier n'est pas accepté (images, PDF, documents, archives, audio et vidéo).",
  rate_limited: 'Trop de tentatives. Réessayez dans une minute.',
  internal_error: 'Erreur du serveur. Réessayez plus tard.',
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return MESSAGES[error.code];
  }
  return MESSAGES.internal_error;
}

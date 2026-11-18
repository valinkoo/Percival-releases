# Document d'Architecture Technique (DAT) : Projet Percival

## 1. Vision et Périmètre du Projet

- **Nom du projet :** Percival
- **Nature :** Application de bureau locale (local-first) de messagerie asynchrone et temps réel, auto-hébergée et structurée sous forme de salons (alternative privée et souveraine à Discord).
- **Cas d'usage :** Outil hybride destiné à un usage solo (bloc-notes, organisation, archivage) et entrepreneurial (gestion de projets, espaces clients compartimentés).
- **Évolutivité (La "Suite") :** Percival est pensé comme le socle central d'un futur écosystème logiciel. Il devra, à terme, s'interfacer de manière transparente avec 4Elements (logiciel de worldbuilding de la suite, développé sous Electron).

## 2. Choix Technologiques

- **Interface (Frontend) :** Tauri v2 (Rust) pour générer un client desktop ultra-léger et performant, s'exécutant nativement sur l'OS local. Interface développée en TypeScript, HTML et CSS.
- **Serveur (Backend) :** Node.js avec TypeScript. Framework API au choix (Express.js ou Fastify).
- **Temps Réel :** `Socket.io` pour propager instantanément les événements de chat.
- **Base de Données :** PostgreSQL, manipulée via un ORM (Prisma ou TypeORM) pour garantir la sécurité et le typage strict des requêtes.
- **Rendu Textuel :** Parseur Markdown intégré côté client (support des titres, listes, tableaux et blocs de code).

## 3. Architecture Système et Déploiement

- **Approche Local-First :** Le client s'installe et s'exécute localement sur la machine de l'utilisateur, offrant la fluidité d'un logiciel de bureau traditionnel.
- **Infrastructure Serveur :** Le backend (Node.js) et la base de données (PostgreSQL) sont conteneurisés via Docker et hébergés sur un serveur local (Raspberry Pi). Toute la logique métier et l'archivage centralisé y résident.
- **Réseau Privé :** Le client desktop se connecte au backend via un réseau maillé sécurisé (Tailscale). Le backend n'expose aucun port sur l'internet public, garantissant un contrôle total.
- **Préparation Inter-App :** Tauri doit être configuré pour supporter le Deep Linking (ex: `percival://channel/id`) afin de permettre des interactions futures et un pont fluide avec 4Elements directement sur le même bureau.

## 4. Modèle Conceptuel de Données (MCD)

- `users` : `id` (UUID), `username` (Unique), `password_hash`, `is_bot` (Boolean, défaut: false), `created_at`.
- `roles` : `id` (UUID), `name` (Admin, Membre, Invité, Bot), `permissions` (JSONB ou Bitmask).
- `user_roles` : `user_id` (FK), `role_id` (FK). Table de jointure.
- `channels` : `id` (UUID), `name`, `description`, `is_private` (Boolean, défaut: false).
- `messages` : `id` (UUID), `channel_id` (FK), `user_id` (FK), `content` (Text formaté en Markdown), `created_at`, `updated_at`.
- `attachments` : `id` (UUID), `message_id` (FK), `file_path` (Stockage local sur le backend), `file_type` (MIME), `file_size`.

## 5. Flux de Communication : REST vs WebSockets

Pour optimiser les ressources, la séparation des flux est stricte :

### A. API REST (Appels synchrones et asynchrones lourds)

- Authentification (Login/génération de JWT).
- Récupération de l'historique des messages lors de l'ouverture d'un salon (avec pagination).
- Traitement des uploads via `multer` (sauvegarde physique sur le serveur et création de l'entrée dans `attachments`).
- Webhooks entrants (ex: `POST /api/webhooks/:token`) pour permettre à des scripts externes de poster dans Percival.

### B. WebSockets (Le temps réel léger)

- Le client s'authentifie au WebSocket avec son JWT.
- Transmission des événements d'interface : `new_message`, `message_updated`, `message_deleted`, `user_typing`.

## 6. Gestion des Droits et Automatisation

- **Cloisonnement des accès :** Un middleware backend vérifie systématiquement le rôle de l'utilisateur. Le rôle "Invité" bloque l'accès à la liste globale des salons pour ne l'autoriser qu'aux salons explicitement assignés (idéal pour un usage entrepreneurial/client).
- **L'écosystème Bot :** Les bots disposent d'un accès par Token Statique (Personal Access Token). Ils peuvent se connecter au WebSocket pour écouter les messages (détecter des préfixes de commande comme `!`) et exécuter de la logique métier en arrière-plan (archivage, requêtes vers d'autres API) avant de répondre dans le canal.

---

## Amendements (7 novembre 2026)

Décisions prises avec le propriétaire du projet avant le début du développement. En cas de conflit, cette section prévaut sur le texte ci-dessus.

### Technologies

- **Frontend :** Svelte avec TypeScript (le DAT initial ne fixait pas de framework). 4Elements utilise React, mais Percival part sur Svelte.
- **Backend :** Fastify et Prisma, dans un monorepo pnpm avec un package de types partagés.
- **Plateforme :** Windows uniquement pour la v1. Interface en français, code et commentaires en anglais.

### Architecture

- **Pas de mode hors-ligne ni de cache local.** « Local-first » signifie ici un client natif installé sur la machine. La logique et l'archivage restent sur le serveur.
- **Hébergement :** développement et usage initial sur le PC Windows, avec Docker Desktop. Un Raspberry Pi reste possible plus tard, avec les mêmes conteneurs.
- **Invités :** ils installent Tailscale et l'application Percival. HTTPS via `tailscale serve`.
- **Deep linking :** le schéma `percival://` est enregistré dès la v1, dans le sens 4Elements vers Percival.

### Modèle de données

- Tables ajoutées : `channel_members` (salons privés et invités), `access_tokens` (jetons des bots, stockés hachés), `webhooks` (jeton haché, salon cible, bot associé).
- `messages` reçoit un champ `deleted_at` (suppression logique) et, depuis la v0.0.3, `edited_at` (date de la dernière modification par l'auteur).
- Depuis la v0.0.3, la table `channel_reads` (utilisateur, salon, date de dernière lecture) mémorise ce que chacun a lu : les messages non lus sont comptés par le serveur, pas par le client.
- `attachments` reçoit `file_name` (nom d'origine, nettoyé par le serveur) et `created_at` en plus des colonnes du MCD.
- Les rôles sont **globaux uniquement**, sans droits par salon.

### Messages (v0.0.3)

- Seul l'auteur modifie son message. Seul l'auteur le supprime en v0.0.3 ; depuis la v0.0.5, les Admin et les Modo suppriment aussi les messages des comptes de rang inférieur (voir « Rôles, comptes et administration »).
- Événements temps réel : `message_updated` (message complet), `message_deleted` (identifiants), `user_typing` (relayé aux autres membres du salon, jamais à l'émetteur ; le client l'émet au plus toutes les 3 s, l'indicateur disparaît après 5 s).
- Après une coupure, le client récupère les messages manqués, les modifications et les suppressions par l'API REST (dernière page de chaque salon déjà ouvert).

### Fichiers joints (v0.0.4)

- **Envoi :** un message avec fichiers est envoyé en `multipart/form-data` sur la route d'envoi habituelle (`POST /api/channels/:id/messages`) : un champ `content` (facultatif s'il y a au moins un fichier) et une partie `files` par fichier. Le texte seul reste en JSON. Au plus 5 fichiers par message, 25 Mo par fichier ; au-delà, le serveur répond 413 (`payload_too_large`).
- **Écart avec le texte initial :** les uploads passent par `@fastify/multipart`, pas par `multer`, qui est un middleware Express et ne fonctionne pas avec Fastify. Le comportement attendu est le même (écriture physique sur le serveur et création de l'entrée dans `attachments`).
- **Stockage :** les fichiers sont écrits dans le répertoire `UPLOADS_DIR` (le volume Docker `uploads`), sous un nom généré par le serveur (`AAAA/MM/<uuid>`). Ni le nom ni le type annoncés par le client n'entrent dans le chemin. Un message refusé ou en erreur ne laisse aucun fichier derrière lui.
- **Types acceptés (liste blanche) :** le type est déterminé par le serveur d'après le **contenu** du fichier (signature binaire), jamais d'après le type annoncé : un programme renommé `photo.png` est refusé. Seuls les formats texte (`.txt`, `.md`, `.csv`, `.json`, `.log`) sont reconnus par leur extension, à condition que le contenu soit bien du texte UTF-8. Liste : images PNG, JPEG, GIF, WebP ; PDF ; texte, Markdown, CSV, JSON ; Word, Excel, PowerPoint (`.docx`, `.xlsx`, `.pptx`) et OpenDocument (`.odt`, `.ods`, `.odp`) ; archives ZIP et 7z ; audio MP3, OGG, WAV, FLAC ; vidéo MP4, WebM, QuickTime. Refusés (415, `unsupported_type`) : programmes, scripts, SVG et HTML (ils peuvent exécuter du code), anciens formats Office (macros). La liste vit dans `apps/server/src/attachments/types.ts`.
- **Téléchargement :** `GET /api/attachments/:id`, authentifié par le jeton comme le reste de l'API. Le fichier n'est servi qu'à qui peut voir le salon du message, et plus une fois le message supprimé : dans les deux cas la réponse est la même 404. Réponse en `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` et `Cache-Control: private, no-store`.
- **Affichage :** les images PNG, JPEG, GIF et WebP sont affichées dans le message (récupérées avec le jeton, au moment où elles entrent dans l'écran, puis montrées via une URL locale `blob:`) ; un clic les ouvre en plein écran. Les autres fichiers apparaissent comme une carte (nom, type, taille) avec un bouton « Télécharger ». Le serveur ne génère pas de miniatures : c'est l'image d'origine qui est chargée.
- **Messages :** un message peut ne contenir que des fichiers (texte vide). Modifier un message conserve ses fichiers ; son texte peut alors être vidé. Supprimer un message (suppression logique) rend ses fichiers inaccessibles, mais ils restent sur le disque (archive) : aucune purge automatique en v1.
- **Sauvegardes :** le volume `uploads` est à sauvegarder avec la base PostgreSQL (v0.0.7).

### Rôles, comptes et administration (v0.0.5)

- **Rôles :** `admin`, `moderator` (affiché « Modo »), `member`, `guest` (« Invité »), `bot`. Hiérarchie Admin > Modo > Membre > Invité ; le Bot est hors hiérarchie (rang 0, aucune permission, et n'importe quel modérateur peut supprimer ses messages). Un compte humain a un seul rôle. La table `roles` reçoit une colonne `rank`, et `permissions` (JSONB) liste les permissions du rôle. La source de vérité est le code (`packages/shared/src/roles.ts`) : le serveur resynchronise `rank` et `permissions` dans la table à chaque démarrage.
- **Règle générale :** on n'agit que sur un compte de rang strictement inférieur au sien, et on n'attribue qu'un rôle inférieur au sien. Conséquence voulue : personne ne touche à un compte de même rang, le sien compris (pas de désactivation ni de changement de rôle de son propre compte). Toutes les vérifications sont faites côté serveur ; masquer un bouton ne protège rien.
- **Permissions :**

  | Permission                                                                        |        Admin         |      Modo      |
  | --------------------------------------------------------------------------------- | :------------------: | :------------: |
  | Créer un salon, renommer un salon, gérer ses membres                              |         oui          |      oui       |
  | Supprimer les messages d'un compte de rang inférieur                              |         oui          |      oui       |
  | Voir la liste des comptes (un Modo ne voit ni les Admin ni les Modo)              |         oui          |      oui       |
  | Créer un compte, désactiver / réactiver un compte, réinitialiser son mot de passe |         oui          |      oui       |
  | Rôle que l'on peut donner à la création                                           | Modo, Membre, Invité | Membre, Invité |
  | Changer le rôle d'un compte                                                       |         oui          |      non       |

  Ni le Modo ni l'Admin ne peuvent supprimer un salon : la suppression de salon n'existe pas encore. Les bots, jetons et webhooks (v0.0.6) et les réglages du serveur restent hors de portée du Modo.

- **Salons :** la visibilité ne change pas (l'Admin voit tout ; les autres voient les salons publics, sauf les Invités, et ceux dont ils sont membres ; un Invité ne voit que ses salons assignés). Un Modo gère donc les membres des salons qu'il voit. Un salon privé se crée avec sa case « Salon privé » et son créateur en devient membre ; le caractère privé ne se modifie pas après la création. Pour un salon public, la liste des membres sert à assigner les Invités.
- **Comptes :** `users` reçoit `disabled_at` (compte désactivé : connexion refusée, connexions temps réel coupées sur le coup, historique conservé), `must_change_password` et `sessions_revoked_before` (un jeton émis avant cette date est refusé ; la date est mise à jour à chaque changement ou réinitialisation de mot de passe et à chaque désactivation, pour qu'une réactivation ne ressuscite pas d'anciennes sessions).
- **Mots de passe :** l'Admin ou le Modo saisit un mot de passe provisoire (le client peut en générer un) et le communique lui-même : il n'y a pas de courriel. Le compte porte alors `must_change_password` : tant que la personne n'a pas choisi son propre mot de passe, le serveur refuse tout sauf `GET /api/auth/me` et `POST /api/auth/password` (403 `password_change_required`), et le client n'affiche que l'écran de changement. Même chose après une réinitialisation. Paramètres > Compte permet de changer son mot de passe à tout moment (mot de passe actuel exigé, nouveau mot de passe différent) ; les autres sessions du compte sont alors fermées.
- **API :** `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id` (`role`, `active`), `POST /api/users/:id/password`, `POST /api/auth/password`, `PATCH /api/channels/:id` (nom, description), `GET /api/channels/:id/members`, `PUT /api/channels/:id/members/:userId`, `DELETE /api/channels/:id/members/:userId`. `POST /api/channels` accepte `isPrivate`. La suppression d'un message d'autrui passe par la route de suppression habituelle ; la modification reste réservée à l'auteur.
- **Temps réel :** nouveaux événements `channel_updated` (salon renommé), `channel_removed` (la personne n'a plus accès au salon) et `account_updated` (rôle ou état de son propre compte modifié). Le serveur ajuste les salons auxquels les connexions d'une personne sont abonnées quand ses droits ou ses appartenances changent.
- **Codes d'erreur ajoutés :** `account_disabled` (403, à la connexion ou en cours de session) et `password_change_required` (403).

### Comptes

- Seuls les administrateurs et les modérateurs créent les comptes, depuis Paramètres > Administration (avec un rôle inférieur au leur). Pas d'inscription ouverte.
- Le premier administrateur est créé par un script au démarrage du serveur.

### Défauts retenus

- Uploads limités à 25 Mo, avec une liste blanche de types MIME.
- Markdown rendu avec markdown-it, DOMPurify et une CSP stricte.
- Hors v1 : présence en ligne, fils de discussion, réactions, recherche plein texte.

### Distribution

- Après la v0.0.2 : installateur Windows et mises à jour automatiques via GitHub Releases (plugin updater de Tauri).
- Développement par versions `0.0.x`, avec une recette globale à la fin de chacune.

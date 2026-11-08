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
- `messages` reçoit un champ `deleted_at` (suppression logique).
- Les rôles sont **globaux uniquement**, sans droits par salon.

### Comptes

- Seuls les administrateurs créent les comptes. Pas d'inscription ouverte.
- Le premier administrateur est créé par un script au démarrage du serveur.

### Défauts retenus

- Uploads limités à 25 Mo, avec une liste blanche de types MIME.
- Markdown rendu avec markdown-it, DOMPurify et une CSP stricte.
- Hors v1 : présence en ligne, fils de discussion, réactions, recherche plein texte.

### Distribution

- Après la v0.0.2 : installateur Windows et mises à jour automatiques via GitHub Releases (plugin updater de Tauri).
- Développement par versions `0.0.x`, avec une recette globale à la fin de chacune.

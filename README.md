# Percival

Messagerie de bureau locale, auto-hébergée et structurée en salons : une alternative privée et souveraine à Discord. Elle sert aussi bien d'outil solo (bloc-notes, organisation, archivage) que d'outil d'entreprise (gestion de projets, espaces clients compartimentés).

Percival est le socle d'un futur écosystème logiciel, avec une intégration prévue avec 4Elements.

> **État :** démarrage du développement (v0.0.1 en préparation).

## Stack

| Couche | Technologies |
|---|---|
| Client | Tauri v2 (Rust) + Svelte + TypeScript, Windows |
| Serveur | Node.js + TypeScript, Fastify, Socket.io |
| Données | PostgreSQL + Prisma |
| Déploiement | Docker (PostgreSQL + API), accès privé via Tailscale |

La spécification complète se trouve dans [`docs/DAT.md`](docs/DAT.md), amendements compris.

## Structure prévue

```
.
├─ apps/
│  ├─ desktop/   client Tauri + Svelte
│  └─ server/    API Fastify + Socket.io + Prisma
├─ packages/
│  └─ shared/    types TypeScript partagés client / serveur
├─ docs/         DAT et décisions
└─ docker-compose.yml   PostgreSQL + API
```

## Méthode de travail

- Développement par petites versions `0.0.x`, suivies sur un tableau Trello.
- À la fin de chaque version : recette globale, correction des bugs, puis version suivante.
- Après la v0.0.2 : installateur Windows et mises à jour automatiques via GitHub Releases.

### Git

- `main` ne contient que des versions validées, étiquetées `vX.Y.Z`.
- Le travail d'une version se fait sur `dev/vX.Y.Z`, fusionnée dans `main` après la recette.
- Messages de commit en anglais, au format Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).

# Percival

Messagerie de bureau locale, auto-hébergée et structurée en salons : une alternative privée et souveraine à Discord. Elle sert aussi bien d'outil solo (bloc-notes, organisation, archivage) que d'outil d'entreprise (gestion de projets, espaces clients compartimentés).

Percival est le socle d'un futur écosystème logiciel, avec une intégration prévue avec 4Elements.

> **État :** v0.0.1 en recette (fondations : serveur, base de données, connexion).

## Stack

| Couche      | Technologies                                         |
| ----------- | ---------------------------------------------------- |
| Client      | Tauri v2 (Rust) + Svelte + TypeScript, Windows       |
| Serveur     | Node.js + TypeScript, Fastify, Socket.io             |
| Données     | PostgreSQL + Prisma                                  |
| Déploiement | Docker (PostgreSQL + API), accès privé via Tailscale |

La spécification complète se trouve dans [`docs/DAT.md`](docs/DAT.md), amendements compris.

## Structure

```
.
├─ apps/
│  ├─ desktop/   client Tauri + Svelte (src-tauri : coque Rust)
│  └─ server/    API Fastify + Prisma (Socket.io à partir de la v0.0.2)
├─ packages/
│  └─ shared/    types et constantes partagés client / serveur
├─ docs/         DAT et décisions
├─ docker-compose.yml   PostgreSQL + API
└─ .env.example         modèle de configuration (copier en .env)
```

## Démarrage (développement, Windows)

Prérequis : Node 24, pnpm, Rust (MSVC Build Tools), Docker Desktop.

```bash
pnpm install
cp .env.example .env          # puis remplacer les secrets (voir les commentaires du fichier)
docker compose up -d --build  # PostgreSQL + API sur 127.0.0.1:3000 (migrations appliquées au démarrage)
docker compose run --rm api node dist/scripts/create-admin.js   # crée le premier administrateur
pnpm dev:desktop              # lance le client Tauri
```

Autres commandes utiles :

| Commande                          | Rôle                                                  |
| --------------------------------- | ----------------------------------------------------- |
| `pnpm build`                      | compile les types partagés, le serveur et l'interface |
| `pnpm typecheck`                  | vérifie les types de tout le monorepo                 |
| `pnpm lint` / `pnpm format:check` | ESLint et Prettier                                    |
| `docker compose up -d db`         | PostgreSQL seul, pour lancer l'API à la main          |
| `pnpm dev:server`                 | API sur l'hôte (utilise `DATABASE_URL` de `.env`)     |
| `docker compose logs -f api`      | logs de l'API                                         |
| `docker compose down`             | arrête la pile (`-v` efface aussi la base de données) |

Le client n'accepte que `localhost` ou une adresse Tailscale (`*.ts.net`, en HTTPS) comme adresse de serveur : c'est volontaire, la politique de sécurité (CSP) de l'application l'impose.

## Méthode de travail

- Développement par petites versions `0.0.x`, suivies sur un tableau Trello.
- À la fin de chaque version : recette globale, correction des bugs, puis version suivante.
- Après la v0.0.2 : installateur Windows et mises à jour automatiques via GitHub Releases.

### Git

- `main` ne contient que des versions validées, étiquetées `vX.Y.Z`.
- Le travail d'une version se fait sur `dev/vX.Y.Z`, fusionnée dans `main` après la recette.
- Messages de commit en anglais, au format Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).

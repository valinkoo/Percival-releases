# Percival: project guide for Claude

Private, self-hosted, desktop chat app organized in channels (a Discord-like tool). Full spec: `docs/DAT.md` (French). Its "Amendements" section overrides the original text.

## Stack (agreed)

- Client: Tauri v2 (Rust) + Svelte + TypeScript. Windows only for now. UI in French.
- Server: Node.js + TypeScript, Fastify, Prisma, PostgreSQL, Socket.io, run with Docker (Debian slim image, ARM64-compatible for a possible Raspberry Pi later).
- pnpm monorepo: `apps/desktop`, `apps/server`, `packages/shared` (shared types).
- Markdown rendering: markdown-it + DOMPurify + strict CSP, minimal Tauri capabilities (an XSS in the WebView can reach the system).
- Network: private only, via Tailscale. HTTPS through `tailscale serve`. No public port.

## Scope decisions

- No offline mode, no read cache. The server holds all logic and archives.
- Roles are global and ranked (Admin > Modo > Membre > Invité; Bot is outside the hierarchy). A user acts only on a strictly lower rank and grants only a lower role; the rules live in `packages/shared/src/roles.ts` and are enforced server side. Private channels and guest access use `channel_members`. Bots use hashed personal access tokens (`access_tokens`). Inbound webhooks use the `webhooks` table.
- Only admins create accounts. The first admin is created by a script.
- Soft delete on messages. Uploads: 25 MB limit and a MIME allowlist.
- Out of v1: online presence, threads, reactions, full-text search.

## Language

UI strings in French. Code, identifiers, comments and commit messages in English.

## Workflow

- Develop by small versions `0.0.x`, tracked on the Trello board "Percival" (workspace 4Elements). Move cards: Backlog, À faire (version en cours), En cours, À tester, Terminé.
- End of each version: global test pass (the "RECETTE vX" card), bug list, fixes, then the next version. Do not start the next version before the user validates the recette.
- After v0.0.2: Windows installer and automatic updates through GitHub Releases (Tauri updater). The updater's private signing key must never enter the repository.
- Git: `main` holds validated versions only, tagged `vX.Y.Z`. Work happens on `dev/vX.Y.Z`, merged into `main` after the recette. Conventional Commits. Commit and push only when the user asks.

## Dev environment (Windows 11)

Node 24, pnpm, Rust with MSVC Build Tools, Docker Desktop (WSL 2). Tailscale is only needed to test guest access.

## Secrets

Never commit `.env`, signing keys or tokens. Provide a `.env.example` instead.

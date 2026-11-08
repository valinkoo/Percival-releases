# syntax=docker/dockerfile:1
#
# Percival API image. Build context is the repository root (see docker-compose.yml):
#   docker build -f apps/server/Dockerfile .
#
# Debian slim, multi-arch (amd64 and arm64, e.g. Raspberry Pi).

FROM node:24-bookworm-slim AS base
RUN npm install --global pnpm@12.18.0
WORKDIR /repo

# ---- build: install everything, compile shared types and the server -----------------------
FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter "@percival/server..."

COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @percival/shared build \
 && DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm --filter @percival/server exec prisma generate \
 && pnpm --filter @percival/server build

# ---- runtime: production dependencies + compiled output ---------------------------------
FROM base AS runtime
ENV NODE_ENV=production
# Prisma's schema engine (used by `migrate deploy`) needs OpenSSL.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --prod --filter "@percival/server..."

COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/server/dist apps/server/dist
COPY apps/server/prisma apps/server/prisma
COPY apps/server/prisma.config.ts apps/server/

USER node
WORKDIR /repo/apps/server
EXPOSE 3000

# Apply pending migrations, then start the API.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/index.js"]

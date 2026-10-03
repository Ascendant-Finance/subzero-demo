# syntax=docker/dockerfile:1
# Build context is the repo root so the shared workspace package is available.
FROM node:20-alpine AS base
# Prisma's engines need openssl and glibc compatibility on alpine.
RUN apk add --no-cache openssl libc6-compat \
  && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @trello-clone/shared... --filter api...

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY tsconfig.base.json ./
RUN pnpm --filter @trello-clone/shared build \
  && pnpm --filter api exec prisma generate \
  && pnpm --filter api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api

WORKDIR /app/apps/api
EXPOSE 4000

# Migrations run at boot, then the api starts. Never points at a remote
# database without the operator setting DATABASE_URL themselves.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]

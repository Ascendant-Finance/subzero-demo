# Stacks — the SubZero demo app

A workspace based kanban tool with boards, lists, cards, drag and drop, and real
time multi user collaboration — with a few production bugs left in its API on
purpose.

This is the app behind **[demo.sub-zero.dev](https://demo.sub-zero.dev)**. When
it crashes, SubZero files the incident on its own; you connect your coding agent
to the queue and let it fix the code and close the tickets. Start a sandbox at
[demo.sub-zero.dev](https://demo.sub-zero.dev), then follow **[DEMO.md](DEMO.md)**.

Built from `Trello Clone: Build Specification` v1.1 (included). A functionally
equivalent app, not a visual or trademark clone.

## Stack

| Area | Choice |
| --- | --- |
| Runtime | Node.js 20 LTS, pnpm 9 workspaces |
| Backend | NestJS 10, socket.io gateway with the Redis adapter |
| Database | PostgreSQL 16 via Prisma 5 |
| Realtime | Redis 7, `@socket.io/redis-adapter` |
| Ordering | `fractional-indexing`, server authoritative |
| Frontend | Next.js 15 App Router, React 19, Tailwind CSS v4 |
| Drag and drop | `@dnd-kit/core` and `@dnd-kit/sortable` |
| Client state | TanStack Query for REST, Zustand for live board state |
| Storage | S3 compatible object storage through presigned uploads |
| Tests | Vitest, Jest and Supertest, Playwright |

## Layout

```
packages/shared    zod schemas, WS event map, error codes, ordering helpers
apps/api           NestJS API, Prisma schema and migrations, socket gateway
apps/web           Next.js client
nginx              reverse proxy config with websocket upgrade
```

Cross app imports go only through `@trello-clone/shared`.

## Running it locally

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm --filter @trello-clone/shared build
pnpm --filter api prisma:migrate
pnpm --filter api prisma:seed
pnpm --filter api dev      # http://localhost:4000
pnpm --filter web dev      # http://localhost:3000
```

The seed creates `ada@example.com` and `grace@example.com`, both with the
password `password123`.

If this machine already runs Postgres or Redis on the default ports, publish the
containers elsewhere with a `docker-compose.override.yml` and point `.env` at
those ports.

## Tests

```bash
pnpm --filter @trello-clone/shared test   # ordering and mention helpers
pnpm --filter web test                    # board store reconciliation
pnpm --filter api test:e2e                # API, ordering, realtime
pnpm --filter web exec playwright test    # drag and drop, two browser sessions
```

The API e2e suite needs Postgres and Redis running and a `trelloclone_test`
database. The Playwright suite needs the API and the web app already serving.

## Ordering, the part that matters

Lists and cards are ordered by a fractional index string. The client never
computes or sends a position: it sends the ids of the two neighbours the item
was dropped between. The server takes a board scoped lock, reads the live
neighbour positions, computes the key with `generateKeyBetween`, writes one row,
and broadcasts the authoritative `{ id, listId, position }` so every client,
including the one that dragged, reconciles to the server order.

When a computed key passes 50 characters the server rebalances that scope with
evenly spaced keys inside the same transaction and broadcasts `list:reordered`
or `board:lists_reordered`.

## Deploying

demo.sub-zero.dev is deployed by `.github/workflows/deploy.yml` to a droplet
running PM2, Postgres and Redis behind nginx; see [DEPLOY.md](DEPLOY.md).

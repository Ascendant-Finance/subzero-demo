# Trello Clone: Build Specification

Status: canonical build spec. Version 1.1. Target harness: Claude Code or an equivalent autonomous builder.

This document is decision-complete. Every architectural fork is resolved below. This is a real time collaborative kanban board app in the style of Trello. Treat this as a fully resolved blueprint for a junior developer. The human supplies only the items in section 16 (secrets and domains).

Note on identity: this is a functionally equivalent app, not a visual or trademark clone. Do not reproduce Trello's name, logo, or exact color identity. Use the original neutral design in section 8.

---

## 0. Revision History

### 1.1, revised after a full build of 1.0

Version 1.0 was buildable end to end, but a complete implementation surfaced three internal contradictions, four under-specified contracts, and eight environment traps that each cost real debugging time. Every change below is derived from something that actually broke or actually could not be built as written.

**Contradictions resolved**

1. **The rebalance acceptance test was arithmetically impossible.** 1.0 locked a 50 character rebalance threshold (5.3, 13) while requiring that 60 sequential inserts into one gap fire a rebalance (phase 5). Measured growth for `fractional-indexing` is about one character per five inserts into the same gap: 60 inserts reach roughly 14 characters, and about 240 are needed to pass 50. Both requirements cannot hold. 1.1 keeps the threshold and rewrites the test (5.6).
2. **`NOT_FOUND` and `FORBIDDEN` were defined in conflict.** 6.6 defined `NOT_FOUND` as "missing or not visible" while phase 3 acceptance required `FORBIDDEN` for a non member on a private board. 1.1 states one rule (6.6, 6.7).
3. **`due_soon` notifications were required and simultaneously forbidden.** 2.1 listed due soon notifications in scope, `NotificationType` included `due_soon`, and section 14 banned any worker or queue, leaving no mechanism to ever emit one. 1.1 permits one in-process scheduled sweep and adds the column that makes it idempotent (2.1, 6.2, 6.3).

**Contracts corrected**

4. `POST /uploads/presign` carried no card id, so it could neither authorize the caller nor build a storage key (6.3).
5. `GET /users/search` was never specified, yet the add-member flow in phase 12 cannot be built without it (6.3).
6. `card:deleted` was in the websocket contract with no endpoint that could ever emit it (6.4).
7. `RATE_LIMITED` was in the error table with no rule saying where throttling applies (6.6).

**Hazards documented**

8. A new section 5.7 covers the deadlock the 1.0 locking scheme allows, and section 18 covers seven packaging and runtime traps, including the one that makes the 1.0 websocket contract unimplementable as written (18.1).

Everything else, including the entire locked stack, the data model, the permission model, the design tokens, and the locked copy, is unchanged from 1.0.

---

## 1. Harness Operating Rules

Hard constraints. They override any default behavior.

1. **Report first, then build.** Start each phase with a plan, end with a completion report. Do not cross phase gates silently.
2. **Grep-first file discovery.** Grep for the symbol or route before editing. Read the file, then edit. Never assume contents from memory.
3. **Whole-block replacements.** Replace complete functions, components, or config objects. Never splice partial lines into unseen context.
4. **No deploy, no push without approval.** Never run `git push`, `docker push`, a remote deploy, or a migration against a non-local database. Print the exact command and stop for approval.
5. **No em-dashes anywhere.** Not in code, comments, copy, commits, or docs.
6. **Locked copy is final.** Strings in section 8.4 are exact.
7. **Contracts are the source of truth.** The Prisma schema (6.2), REST contract (6.3), WebSocket contract (6.4), and the ordering rules (section 5) are canonical. Code that disagrees is a bug. Shared types (6.5) derive from these and stay in sync.
8. **One write path per mutation.** REST controllers and WebSocket handlers both delegate to the same service method.
9. **The server owns ordering.** The client never sends a position key. It sends neighbor ids and the server computes the authoritative fractional key inside a locked transaction. See section 5.
10. **When genuinely blocked**, only section 17 is open. Anything else: pick the option most consistent with the locked stack, build it, note it in the phase report.
11. **Measure before you trust a number.** Where this spec states a quantity that a test depends on (key growth rates, thresholds, payload sizes), verify it against the real library before writing the assertion. If the measurement disagrees with this document, the measurement wins: build to it and flag the discrepancy in the phase report.
12. **An acceptance criterion must be executable.** If a criterion cannot be turned into a test that genuinely exercises the stated behavior, say so in the phase report rather than writing a test that passes without covering it. A test that asserts something the code cannot do is worse than no test.

---

## 2. Product Scope

A workspace-based kanban tool with boards, lists, cards, drag and drop, and real time multi user collaboration.

### 2.1 In scope

- Email and password auth with JWT access and rotating refresh tokens.
- Workspaces with members and roles (admin, member), and invites.
- Boards with visibility (private, workspace, public), backgrounds, members and roles (admin, member, observer), stars, and archiving.
- Lists (columns): create, rename, reorder, archive.
- Cards: create, edit (title, markdown description), reorder within a list, move across lists, archive, due date with a complete state, and a cover.
- Card details: labels, member assignees, checklists with items and progress, comments with mentions, and attachments (file and link).
- Real time collaboration: every board mutation is broadcast to everyone viewing the board, with optimistic drag and drop reconciled to the server order.
- Board presence: avatars of users currently viewing the board.
- Activity log per board and per card.
- Notifications: mention in a comment, assigned to a card, added to a board, and due soon.
- Filters: by label, member, due state, and a card text search scoped to the board.

**On due soon notifications.** These are the one feature that cannot be produced by a request handler, because nothing triggers them except the passage of time. Section 14 forbids a worker service and a message queue, and that ban stands. The permitted mechanism is narrower: a single in-process scheduled sweep inside the API process, using `@nestjs/schedule`, running every 15 minutes. It selects cards whose `dueAt` falls inside the next 24 hours, where `dueComplete` is false and `dueNotifiedAt` is null, writes one `due_soon` notification per card assignee, and stamps `dueNotifiedAt` in the same transaction so the sweep is idempotent and a card notifies once. Multiple API instances are safe because the sweep takes the same board advisory lock pattern used for ordering, keyed on the card id. This is not a worker and not a queue: it is one timer in the process that already owns the write path.

### 2.2 Out of scope (do not build, do not stub in UI)

Power-ups and plugins, automation rules (Butler), calendar and timeline and dashboard views beyond the board view, board templates gallery, Google or GitHub OAuth (email auth only for v1), billing and plan tiers, email delivery of notifications (in app only), and a native mobile app.

---

## 3. Tech Stack (locked)

- Runtime: Node.js 20 LTS. Package manager: pnpm 9, workspaces. No Turbo.
- Backend: NestJS 10, WebSocket gateway via `@nestjs/websockets` with the `socket.io` adapter.
- ORM: Prisma 5 against PostgreSQL 16.
- Realtime fan out, presence, and socket adapter: Redis 7 with `@socket.io/redis-adapter`.
- Ordering: the `fractional-indexing` package (`generateKeyBetween`, `generateNKeysBetween`). See section 5.
- Scheduling: `@nestjs/schedule`, used only for the due soon sweep in 2.1.
- Auth: JWT access (15m) plus rotating refresh (30d) with hashed storage, `bcryptjs` for passwords.
- Object storage: S3 compatible (DigitalOcean Spaces) via `@aws-sdk/client-s3` and the presigner.
- Frontend: Next.js 15, App Router, React 19, TypeScript.
- Drag and drop: `@dnd-kit/core` and `@dnd-kit/sortable` (accessible, maintained). Do not use react-beautiful-dnd.
- Frontend data: TanStack Query for REST bootstrap and history, a normalized Zustand board store for live state and optimistic moves, `socket.io-client` for realtime.
- Styling: Tailwind CSS v4 with the tokens in section 8.1. Icons: `lucide-react`.
- Markdown: `react-markdown` with a sanitizer for rendering descriptions and comments. Input is a plain markdown textarea with a preview toggle and a mention autocomplete in comments.
- Validation: `zod` in `packages/shared`, reused by both apps, with a Nest Zod validation pipe.
- Testing: Jest plus Supertest (API), Vitest plus React Testing Library (web unit), Playwright for the drag and drop and multi client flows.
- Local orchestration: Docker Compose (postgres, redis, api, web).
- Deploy target: a DigitalOcean droplet running Docker Compose behind nginx, uploads on Spaces plus CDN. CI via GitHub Actions.

There is no separate worker and no message queue. Activity and notification writes happen in the same transaction as the triggering mutation and are broadcast over the socket. The single exception is the due soon sweep described in 2.1, which runs in the API process.

**Packaging constraint.** `fractional-indexing` v3 ships as ESM only. NestJS compiles to CommonJS, and Node 20 cannot `require()` an ES module, so a CJS build of `packages/shared` that leaves it external fails at runtime on the target runtime even though it works on newer Node. Bundle it into the shared package's CJS output (`noExternal` in tsup). See 18.2.

---

## 4. Repository Layout

Monorepo, pnpm workspaces.

```
trello-clone/
  package.json
  pnpm-workspace.yaml
  docker-compose.yml
  docker-compose.prod.yml
  .env.example
  .dockerignore
  .github/workflows/ci.yml
  nginx/nginx.conf
  packages/
    shared/                 # zod schemas, types, WS event contract, error codes, ordering helpers
  apps/
    api/                    # NestJS
      prisma/schema.prisma
      prisma/seed.ts
      tsconfig.build.json   # see 18.5
      src/
        main.ts
        common/             # guards, pipes, filters, decorators
        prisma/
        redis/
        auth/
        users/
        workspaces/
        boards/
        lists/
        cards/              # includes move + ordering service
        ordering/           # the locking and key computation engine
        labels/
        checklists/
        comments/
        attachments/
        activity/
        notifications/      # includes the due soon sweep
        search/
        permissions/
        realtime/           # gateway, board presence
      Dockerfile
    web/                    # Next.js 15
      src/
        app/
        components/
          board/            # Board, List, Card, CardModal, dnd wiring
        lib/                # api client, socket client, query hooks
        stores/             # zustand board store
        styles/
      e2e/                  # playwright
      Dockerfile
```

Rule: cross app imports go only through `packages/shared`.

---

## 5. Ordering Rules (locked, the hard part)

Lists within a board and cards within a list are ordered by a fractional index `position`, a string ordered lexicographically. This lets any item move to any slot by writing one row, with no renumbering.

### 5.1 The authoritative rule

The client never computes or sends a `position`. On any move it sends the target context and the neighbor ids:

- Move a card: `{ cardId, targetListId, beforeCardId | null, afterCardId | null }`. `beforeCardId` is the card that will sit directly above the moved card in the target list, `afterCardId` directly below. Either may be null at an edge.
- Move a list: `{ listId, beforeListId | null, afterListId | null }`.

The server, inside a transaction:

1. Takes the board ordering lock described in 5.7. This is required and comes first.
2. Locks the ordering scope with `SELECT ... FOR UPDATE` on the sibling rows (all cards in the target list, or all lists in the board) to serialize concurrent moves.
3. Reads the current `position` of the two neighbors from the database, not from the client.
4. Computes `position = generateKeyBetween(beforePosition, afterPosition)` where a null neighbor passes null.
5. Writes the moved row's `listId` (for cross list card moves) and `position`.
6. Broadcasts the resulting authoritative `{ id, listId, position }` so every client reconciles, including the initiator whose optimistic order is corrected if it differed.

Because the server reads live neighbor positions under a lock, two clients dropping into the same gap serialize and produce two valid adjacent keys. There is no client side key collision.

### 5.2 Seeding and appends

- Creating the first item in an empty scope: `generateKeyBetween(null, null)`.
- Appending to the end: `generateKeyBetween(lastPosition, null)`.
- Seeding N items at once: `generateNKeysBetween(null, null, n)`.

### 5.3 Rebalancing

Keys grow longer as items are repeatedly inserted into the same gap. If a computed key exceeds 50 characters, after the move the server rebalances that scope: it regenerates evenly spaced keys for all siblings with `generateNKeysBetween`, writes them in the same transaction, and broadcasts a `list:reordered` or `board:lists_reordered` event carrying the full ordered id list so clients resync. Rebalancing is transparent to the user.

**Measured growth, so nobody writes an impossible test.** Splitting the same gap repeatedly grows the key by roughly one character per five inserts. Concretely, with `generateKeyBetween`, 60 consecutive inserts into one gap produce a longest key of about 14 characters, and it takes on the order of 240 inserts to cross 50. A rebalance is therefore genuinely rare in normal use, which is the intent. Any test that claims to trigger a rebalance must either perform hundreds of inserts or plant the deep gap directly. See 5.6.

**The rebalance write must be two-phase.** `@@unique([listId, position])` and `@@unique([boardId, position])` are created by Prisma as unique *indexes*, and PostgreSQL cannot defer a unique index (only a unique *constraint* can be `DEFERRABLE`). Rewriting sibling keys one row at a time therefore collides mid-transaction as soon as one row takes a key another row still holds. Write the rebalance in two passes inside the one transaction:

1. Set every sibling in the scope to a staging key that cannot collide with a real one. Prefix with a character outside the base62 alphabet `fractional-indexing` uses and append the row id, for example `~<rowId>`, which is unique per row by construction.
2. Write the final `generateNKeysBetween` keys in order.

Do not attempt to solve this by dropping the unique index or by converting it to a deferrable constraint. The index is the guard described in 5.4, and the two-phase write is cheap because a rebalance touches one bounded scope and is rare.

### 5.4 Constraints

`@@unique([listId, position])` on cards and `@@unique([boardId, position])` on lists exist as a guard. The server never relies on the client to keep them unique; the locked transaction guarantees it.

### 5.5 Stale neighbor ids

A client can send a neighbor that has moved away or been archived between the drag starting and the request landing. This is normal under concurrency and must not be an error. Resolve against the live ordered sibling set, after removing the moved item:

- Both neighbors present and adjacent: use their two positions.
- Only `before` present: use it and whatever now follows it, or null at the end.
- Only `after` present: use whatever now precedes it, or null at the start, and its position.
- Neither present: append to the end of the scope. For an empty scope this is the first key; for a non empty scope this is the stable interpretation of a fully stale request.

Never throw `VALIDATION_FAILED` for a stale neighbor. The client receives the authoritative position in the broadcast and snaps to it.

### 5.6 What the ordering tests must actually assert

Phase 5 acceptance is precise, because this is the part of the app most likely to be quietly wrong:

1. **Placement.** Create two lists. Move a card from one into the middle of the other by sending only neighbor ids. Assert the returned position sorts strictly between the two neighbors and that the board bootstrap returns the three cards in the expected order.
2. **Server ownership.** Send a move whose body also contains a `position` field. Assert the stored position is not the client's value.
3. **Sustained inserts.** Perform 60 sequential inserts into one gap through the API. Assert all 62 positions are unique, sort in the expected order, and that the most recent insert sits where it was dropped. Do not assert that a rebalance fired: per 5.3 it will not, and asserting it either fails or forces a wrong threshold.
4. **Rebalance.** Plant the deep gap directly: compute keys with the real library until `generateKeyBetween(low, high)` exceeds 50 characters, write those two keys onto two sibling rows, then perform a move between them through the API. Assert every position in the scope afterwards is at most 50 characters, the order is preserved, and the matching `list:reordered` or `board:lists_reordered` event carried the full ordered id list.
5. **Concurrency.** Fire two moves into the same gap concurrently with `Promise.all`. Assert both return success, the two positions differ, both land adjacent between the same neighbors, and the whole scope still sorts correctly with no duplicates.
6. **Cross board rejection.** Move a card into a list belonging to another board. Assert `NOT_FOUND`.

### 5.7 Lock ordering, and the deadlock that row locks alone allow

Row locks on the sibling set are necessary but not sufficient. Two concurrent cross list moves in opposite directions deadlock: a move of card A from list X into list Y locks Y's rows and then needs A, which sits in X; a simultaneous move of card B from Y into X locks X's rows, which include A, and then needs B, which sits in Y. Each transaction holds what the other needs. PostgreSQL detects this and aborts one transaction with a deadlock error, surfacing to a user as a failed drag.

Every ordering transaction therefore takes one transaction scoped advisory lock keyed by the board before it takes any row locks:

```sql
SELECT pg_advisory_xact_lock(hashtext($boardId))
```

This gives every ordering transaction on a board a single, deterministic acquisition order, so they queue instead of deadlocking. It is held only for the duration of the move, and moves on different boards never contend. The `SELECT ... FOR UPDATE` in 5.1 stays: it is what makes the neighbor reads consistent within the transaction.

Note for Prisma: `pg_advisory_xact_lock` returns `void`, which `$queryRaw` cannot deserialize. Issue it with `$executeRaw`.

---

## 6. System Contracts (canonical)

### 6.1 Environment variables

`.env.example` must contain exactly these keys.

API:
```
NODE_ENV=development
API_PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trelloclone
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=change_me_access
JWT_REFRESH_SECRET=change_me_refresh
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
WEB_ORIGIN=http://localhost:3000
COOKIE_DOMAIN=localhost
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
SPACES_REGION=nyc3
SPACES_BUCKET=trello-clone-uploads
SPACES_KEY=
SPACES_SECRET=
SPACES_PUBLIC_BASE_URL=https://trello-clone-uploads.nyc3.cdn.digitaloceanspaces.com
UPLOAD_MAX_BYTES=26214400
DUE_SOON_SWEEP_CRON=*/15 * * * *
```

Web:
```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
```

`.env.example` is written for a clean machine and uses the default ports. Developer machines frequently already run PostgreSQL or Redis on 5432 and 6379, in which case the containers start but their published ports are shadowed and every connection silently reaches the local service instead. Do not edit the committed files to work around this. Add an uncommitted `docker-compose.override.yml` republishing the containers on free ports and point a local `.env` at them, and confirm which server is answering with `psql -h 127.0.0.1 -p <port> -tAc "select version()"` before debugging anything else. See 18.7.

### 6.2 Prisma schema

Canonical data model. Note that enum values are one per line: Prisma rejects the inline `enum X { a b }` form.

```prisma
generator client {
  provider = "prisma-client-js"
  // The deploy image is node:20-alpine. Without the musl target the engine
  // fails at runtime with an opaque schema engine error. See 18.3.
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum WorkspaceRole {
  admin
  member
}

enum BoardRole {
  admin
  member
  observer
}

enum BoardVisibility {
  private
  workspace
  public
}

enum CoverType {
  none
  color
  image
}

enum AttachmentKind {
  file
  link
}

enum NotificationType {
  mention
  assigned
  due_soon
  added_to_board
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  avatarUrl    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  workspaceMemberships WorkspaceMember[]
  boardMemberships     BoardMember[]
  stars                BoardStar[]
  cardsCreated         Card[]            @relation("cardCreator")
  cardAssignments      CardMember[]
  comments             Comment[]
  attachments          Attachment[]
  activities           Activity[]
  notifications        Notification[]    @relation("recipient")
  refreshTokens        RefreshToken[]
}

model RefreshToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model Workspace {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())

  members WorkspaceMember[]
  boards  Board[]
  invites Invite[]
}

model WorkspaceMember {
  id          String        @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceRole @default(member)
  joinedAt    DateTime      @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
  @@index([userId])
}

model Board {
  id          String          @id @default(cuid())
  workspaceId String
  title       String
  description String?
  visibility  BoardVisibility @default(workspace)
  bgType      CoverType       @default(color)
  bgValue     String          @default("#1d4ed8")
  closed      Boolean         @default(false)
  createdById String
  createdAt   DateTime        @default(now())

  workspace  Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  members    BoardMember[]
  stars      BoardStar[]
  lists      List[]
  cards      Card[]
  labels     Label[]
  activities Activity[]

  @@index([workspaceId])
}

model BoardMember {
  id       String    @id @default(cuid())
  boardId  String
  userId   String
  role     BoardRole @default(member)
  joinedAt DateTime  @default(now())

  board Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([boardId, userId])
  @@index([userId])
}

model BoardStar {
  id      String @id @default(cuid())
  boardId String
  userId  String

  board Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([boardId, userId])
}

model List {
  id        String   @id @default(cuid())
  boardId   String
  title     String
  position  String
  archived  Boolean  @default(false)
  createdAt DateTime @default(now())

  board Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards Card[]

  @@unique([boardId, position])
  @@index([boardId])
}

model Card {
  id          String    @id @default(cuid())
  boardId     String
  listId      String
  title       String
  description String?
  position    String
  dueAt       DateTime?
  dueComplete Boolean   @default(false)
  // Stamped by the due soon sweep (2.1) so a card notifies once. Cleared
  // whenever dueAt changes.
  dueNotifiedAt DateTime?
  coverType   CoverType @default(none)
  coverValue  String?
  archived    Boolean   @default(false)
  createdById String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  board       Board         @relation(fields: [boardId], references: [id], onDelete: Cascade)
  list        List          @relation(fields: [listId], references: [id], onDelete: Cascade)
  createdBy   User          @relation("cardCreator", fields: [createdById], references: [id])
  labels      CardLabel[]
  members     CardMember[]
  checklists  Checklist[]
  comments    Comment[]
  attachments Attachment[]

  @@unique([listId, position])
  @@index([boardId])
  @@index([listId])
  @@index([dueAt, dueComplete])
}

model Label {
  id      String @id @default(cuid())
  boardId String
  name    String @default("")
  color   String

  board Board       @relation(fields: [boardId], references: [id], onDelete: Cascade)
  cards CardLabel[]
  @@index([boardId])
}

model CardLabel {
  cardId  String
  labelId String

  card  Card  @relation(fields: [cardId], references: [id], onDelete: Cascade)
  label Label @relation(fields: [labelId], references: [id], onDelete: Cascade)
  @@id([cardId, labelId])
}

model CardMember {
  cardId String
  userId String

  card Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([cardId, userId])
}

model Checklist {
  id       String   @id @default(cuid())
  cardId   String
  title    String
  position String

  card  Card            @relation(fields: [cardId], references: [id], onDelete: Cascade)
  items ChecklistItem[]
  @@index([cardId])
}

model ChecklistItem {
  id          String    @id @default(cuid())
  checklistId String
  text        String
  completed   Boolean   @default(false)
  position    String
  dueAt       DateTime?
  createdAt   DateTime  @default(now())

  checklist Checklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  @@index([checklistId])
}

model Comment {
  id        String    @id @default(cuid())
  cardId    String
  userId    String
  text      String
  editedAt  DateTime?
  createdAt DateTime  @default(now())

  card Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([cardId])
}

model Attachment {
  id         String         @id @default(cuid())
  cardId     String
  uploaderId String
  kind       AttachmentKind
  url        String
  name       String
  mimeType   String?
  sizeBytes  Int?
  isCover    Boolean        @default(false)
  createdAt  DateTime       @default(now())

  card     Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
  uploader User @relation(fields: [uploaderId], references: [id])
  @@index([cardId])
}

model Activity {
  id        String   @id @default(cuid())
  boardId   String
  cardId    String?
  userId    String
  type      String
  data      Json
  createdAt DateTime @default(now())

  board Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id])
  @@index([boardId, createdAt])
  @@index([cardId])
}

model Notification {
  id        String           @id @default(cuid())
  userId    String
  actorId   String
  type      NotificationType
  boardId   String?
  cardId    String?
  data      Json
  read      Boolean          @default(false)
  createdAt DateTime         @default(now())

  user User @relation("recipient", fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, read])
}

model Invite {
  id          String    @id @default(cuid())
  workspaceId String
  code        String    @unique
  email       String?
  role        WorkspaceRole @default(member)
  createdById String
  expiresAt   DateTime
  createdAt   DateTime  @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
}
```

**Card text search.** Add a follow up migration creating a generated `tsvector` over `Card.title` and `coalesce(description,'')` with a GIN index, weighting title above description, and query it with `websearch_to_tsquery`. Scope search to boards the caller can access.

```sql
ALTER TABLE "Card"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX "Card_searchVector_idx" ON "Card" USING GIN ("searchVector");
```

Prisma 5 cannot represent a generated column, so this column exists only in the migration and is queried through `$queryRaw`. That is deliberate, but it means `prisma migrate dev` sees schema drift and will offer to drop the column. Never accept that prompt. Use `prisma migrate deploy` for applying migrations, and when the schema genuinely changes, add a new migration by hand rather than letting `migrate dev` reset. Record this in the repo README so it does not surprise the next person.

**Seed.** Two users, one workspace with both as members, one board with both as board members, three lists (`To Do`, `Doing`, `Done`) with fractional positions from `generateNKeysBetween`, several cards including one with labels, a checklist, a comment with a mention, an assignee, and a due date. Six default labels per board with the color set in 8.1. The seed must be idempotent: delete its own fixtures by a stable key before inserting, so it can be run repeatedly to reset a demo.

### 6.3 REST API contract

Base path `/api`. JSON bodies. Authenticated routes require `Authorization: Bearer <accessToken>`. Errors return `{ error: { code, message } }` from section 6.6. List and card reads return items already sorted by `position`. Activity and search use cursor pagination on `createdAt` plus `id`, default limit 30.

Auth:
- `POST /auth/register` `{ email, password, name }` returns `{ user, accessToken }`, sets refresh cookie.
- `POST /auth/login` `{ email, password }` returns `{ user, accessToken }`, sets refresh cookie.
- `POST /auth/refresh` (cookie) returns `{ accessToken }`, rotates the cookie.
- `POST /auth/logout` returns `{ ok: true }`.
- `GET /auth/me` returns `{ user }`.

Users:
- `GET /users/search?q=` returns `{ users }`, limited to users who share a workspace with the caller, minimum two characters, at most ten results. This exists because the board member picker in phase 12 has no other way to resolve a name to a user id. It is deliberately not a global directory.

Workspaces:
- `POST /workspaces` `{ name }` returns `{ workspace }` (creator is admin).
- `GET /workspaces` returns `{ workspaces }`.
- `GET /workspaces/:id` returns `{ workspace, members, boards }` (boards the caller can see).
- `POST /workspaces/:id/invites` (admin) `{ email?, role }` returns `{ invite }`.
- `POST /workspaces/join` `{ code }` returns `{ workspace }`.

Route order note: `POST /workspaces/join` must be declared before `POST /workspaces/:id/...` handlers so the literal path is not captured as an id.

Boards:
- `POST /workspaces/:wsId/boards` `{ title, visibility?, bgType?, bgValue? }` returns `{ board }`. Creator is board admin. Seeds the six default labels.
- `GET /boards/:id` returns the full board payload: `{ board, members, lists, cards, labels }`. This is the single bootstrap call for the board view. `lists` excludes archived lists and is sorted by `position`. `cards` excludes archived cards and is sorted by `position`; because the array spans every list, positions repeat across lists and the client groups by `listId` before rendering. `board.starred` reflects the calling user.
- `PATCH /boards/:id` (board admin) `{ title?, description?, visibility?, bgType?, bgValue? }` returns `{ board }`.
- `POST /boards/:id/close` and `POST /boards/:id/reopen` return `{ board }`.
- `POST /boards/:id/star` and `DELETE /boards/:id/star` return `{ starred }`.
- `POST /boards/:id/members` (admin) `{ userId, role }` returns `{ member }`.
- `PATCH /boards/:id/members/:userId` (admin) `{ role }` returns `{ member }`.
- `DELETE /boards/:id/members/:userId` returns `{ ok: true }`. An admin may remove anyone; any member may remove themselves. Removing or demoting the last remaining board admin returns `CONFLICT`.

Lists:
- `POST /boards/:id/lists` `{ title }` returns `{ list }` (appended to the end).
- `PATCH /lists/:id` `{ title?, archived? }` returns `{ list }`.
- `POST /lists/:id/move` `{ beforeListId, afterListId }` returns `{ list }` with the server computed position. Also over WS.

Cards:
- `POST /lists/:id/cards` `{ title }` returns `{ card }` (appended to the end of the list).
- `GET /cards/:id` returns the full card payload: `{ card, labels, members, checklists, comments, attachments }`.
- `PATCH /cards/:id` `{ title?, description?, dueAt?, dueComplete?, coverType?, coverValue?, archived? }` returns `{ card }`. Changing `dueAt` clears `dueNotifiedAt`.
- `POST /cards/:id/move` `{ targetListId, beforeCardId, afterCardId }` returns `{ card }` with the server computed `listId` and `position`. Also over WS.
- `POST /cards/:id/labels` `{ labelId }` and `DELETE /cards/:id/labels/:labelId` return `{ ok: true }`.
- `POST /cards/:id/members` `{ userId }` and `DELETE /cards/:id/members/:userId` return `{ ok: true }`.

Cards are archived, never destroyed, so there is no delete endpoint. See 6.4 on `card:deleted`.

Labels:
- `POST /boards/:id/labels` `{ name, color }`, `PATCH /labels/:id` `{ name?, color? }`, `DELETE /labels/:id`.

Checklists:
- `POST /cards/:id/checklists` `{ title }` returns `{ checklist }`.
- `PATCH /checklists/:id` `{ title? }`, `DELETE /checklists/:id`.
- `POST /checklists/:id/items` `{ text }` returns `{ item }`.
- `PATCH /checklist-items/:id` `{ text?, completed?, dueAt? }`, `DELETE /checklist-items/:id`.

Comments:
- `POST /cards/:id/comments` `{ text }` returns `{ comment }`. Parses `@name` mentions and creates notifications.
- `PATCH /comments/:id` (author) `{ text }`, `DELETE /comments/:id` (author, or a board admin).

Attachments:
- `POST /uploads/presign?cardId=<cardId>` `{ fileName, mimeType, sizeBytes }` returns `{ attachmentId, uploadUrl, publicUrl }`. The card id is required: without it the endpoint can neither check that the caller may edit that card nor build the storage key, and an unscoped presign is an open write to the bucket. Validates `sizeBytes` against `UPLOAD_MAX_BYTES` and returns `UPLOAD_TOO_LARGE` when it exceeds it. The storage key is `cards/<cardId>/<attachmentId>/<sanitized fileName>`.
- `POST /cards/:id/attachments` `{ kind, url, name, mimeType?, sizeBytes?, attachmentId? }` returns `{ attachment }`.
- `POST /cards/:id/attachments/:attId/cover` sets it as the cover, returns `{ card }`.
- `DELETE /attachments/:id`. Deleting the current cover resets the card to `coverType: none`.

Activity, notifications, search:
- `GET /boards/:id/activity?cursor=` returns `{ activities, nextCursor }`.
- `GET /cards/:id/activity?cursor=` returns `{ activities, nextCursor }`.
- `GET /notifications?cursor=` returns `{ notifications, nextCursor }`.
- `POST /notifications/:id/read` and `POST /notifications/read-all` return `{ ok: true }`.
- `GET /boards/:id/search?q=&labelIds=&memberIds=&due=` returns `{ cards }`, filters combinable. `labelIds` and `memberIds` are comma separated. `due` is one of `overdue`, `day`, `week`, `month`, `none`, `complete`, `incomplete`.

### 6.4 WebSocket contract

Namespace `/`, socket.io. Handshake auth `{ auth: { token } }`. Authentication runs as socket.io connection middleware, not in the connection handler: see 18.1, which explains why the alternative is unimplementable. On successful authentication the server joins `user:<userId>` before the client observes `connect`. To receive board events a client emits `board:open` after authorization; the server joins `board:<boardId>` and registers presence.

Rooms: `user:<id>`, `board:<id>`.

Client to server:
- `board:open` `{ boardId }`, `board:close` `{ boardId }`
- `card:move` `{ cardId, targetListId, beforeCardId, afterCardId }`
- `list:move` `{ listId, beforeListId, afterListId }`
- `card:update` `{ cardId, patch }` (title, description, due, cover, archived)
- `presence:ping` `{ boardId }`

Server to client (all scoped to `board:<id>` unless noted):
- `card:created` `{ card }`
- `card:updated` `{ card }`
- `card:moved` `{ cardId, listId, position }`  (authoritative order)
- `list:created` `{ list }`
- `list:updated` `{ list }`
- `list:moved` `{ listId, position }`
- `list:reordered` `{ listId, orderedCardIds }`         (after a rebalance)
- `board:lists_reordered` `{ orderedListIds }`           (after a rebalance)
- `board:members_changed` `{ members }`                  (board membership or role changed)
- `label:changed` `{ cardId, labels }`
- `member:changed` `{ cardId, members }`                 (card assignees, not board membership)
- `checklist:changed` `{ cardId, checklists }`
- `comment:created` `{ comment }`
- `activity:new` `{ activity }`
- `presence:updated` `{ boardId, viewers }`              (list of viewing users)
- `notification:new` `{ notification }` to `user:<id>`
- `error` `{ code, message }` to the originating socket

`board:members_changed` is new in 1.1. In 1.0 the only membership event was `member:changed`, which is card scoped, so adding someone to a board never reached the clients already viewing it: their member avatars, role selectors, and comment mention autocomplete all stayed stale until a reload. Emit it on add, role change, and removal.

`card:deleted` was in the 1.0 contract but no endpoint can produce it, because cards are archived rather than destroyed (an archive is a `card:updated` with `archived: true`). It has been removed. Do not add a delete endpoint to justify it; if hard deletion is wanted later, it is a scope change, not a contract gap.

Delivery rule: `card:move` and `list:move` run the ordering transaction in section 5, then broadcast the authoritative moved payload. Every mutation handler shares its service method with the REST equivalent (rule 8) and writes an `Activity` row in the same transaction, broadcasting `activity:new`.

Error rule: a handler that throws maps the error through the same mapper the HTTP exception filter uses and emits `error` `{ code, message }` to the originating socket only. A failed socket action never disconnects the client.

### 6.5 Shared package contract

`packages/shared/src/index.ts` exports Zod schemas and inferred types for every REST body, response, and WS payload; `WS_EVENTS` const map; `ERROR_CODES`; `ACTIVITY_TYPES`; the locked copy strings from 8.4; the default label palette; the mention parser used by both the comment service and the web autocomplete; and ordering helpers (`positionAtEnd`, `positionBetween`, `seedPositions`, `needsRebalance`) wrapping `fractional-indexing`. Both apps import from `@trello-clone/shared`. No duplicate schema or type anywhere.

The package builds to both ESM and CJS, with `fractional-indexing` bundled into the CJS output (see section 3 and 18.2).

The mention parser must mask each matched span before testing shorter candidates, otherwise a member named `Ada` also matches inside `@Ada Lovelace` and both are notified. Unit test that case explicitly, along with an address like `me@Ada.com` matching nobody.

### 6.6 Error codes

```
UNAUTHENTICATED    401  missing or invalid access token
TOKEN_EXPIRED      401  access token expired, client should refresh
FORBIDDEN          403  authenticated but not permitted for this board or workspace
NOT_FOUND          404  resource does not exist
VALIDATION_FAILED  422  body failed zod validation
CONFLICT           409  unique constraint hit, or an invariant such as the last board admin
RATE_LIMITED       429  too many requests
UPLOAD_TOO_LARGE   413  attachment over the size cap
INTERNAL           500  unexpected
```

A global Nest exception filter maps errors to this shape. The web client refreshes once on `TOKEN_EXPIRED` and retries, sharing one in flight refresh across concurrent requests so a burst of expired calls does not rotate the refresh token several times.

**Visibility rule, stated once.** A resource that does not exist is `NOT_FOUND`. A resource that exists but the authenticated caller may not reach is `FORBIDDEN`. Version 1.0 defined `NOT_FOUND` as covering "not visible" while its phase 3 acceptance demanded `FORBIDDEN` for exactly that case; this is the resolution, and it applies uniformly to boards, lists, cards, and search. The tradeoff is accepted knowingly: `FORBIDDEN` confirms that an id exists, which is the same information the acceptance test asks the API to reveal.

**Where `RATE_LIMITED` applies.** Version 1.0 listed the code without ever specifying a producer, so it was dead. Apply `@nestjs/throttler` to the unauthenticated auth surface only: `POST /auth/register`, `POST /auth/login`, and `POST /auth/refresh`, at 10 requests per minute per IP. Everything else is unthrottled in v1. If you choose not to build throttling, remove the code from the table rather than leaving it unreachable.

### 6.7 Permission model (locked)

- Workspace admins manage members, invites, and can create boards. Members can create boards in the workspace.
- Board access: a private board is visible only to its board members; a workspace board is visible to all workspace members; a public board is readable by anyone authenticated, editable only by board members.
- Board roles: admin manages board settings, members, and content; member edits content (lists, cards, comments); observer has read only plus commenting.
- Every mutating endpoint checks board role. Reads check visibility.
- A closed board rejects all content mutations with `FORBIDDEN` until it is reopened. Reopening is an admin action and is always permitted.
- Editing always requires board membership, whatever the visibility. A public board is readable by any authenticated user and editable by nobody who is not a member.

All of this lives in one permission service with a single `boardAccess(boardId, userId)` entry point returning `{ role, canView, canComment, canEdit, canAdmin }`. Every board scoped endpoint calls it. Do not re-derive permissions inline in controllers.

---

## 7. (reserved)

---

## 8. Design System

Original identity, not a Trello visual clone. Boards carry configurable backgrounds; the app chrome is neutral with a single blue accent.

### 8.1 Tokens

```
--bg:          #f4f5f7
--surface:     #ffffff
--surface-2:   #ebecf0
--list-bg:     #ebecf0
--card-bg:     #ffffff
--border:      #dfe1e6
--text:        #172b4d
--text-muted:  #5e6c84
--accent:      #2563eb
--accent-press:#1d4ed8
--danger:      #de350b
--success:     #22a06b
--radius:      8px
--radius-sm:   4px
```

Default label palette (locked): `#61bd4f` green, `#f2d600` yellow, `#ff9f1a` orange, `#eb5a46` red, `#c377e0` purple, `#0079bf` blue.

Font: system stack, base 14. Board backgrounds render behind translucent lists. The app mark is a simple original geometric glyph, no third party logo.

### 8.2 Board layout

Horizontal scrolling column of lists. Each list is a fixed 272 pixel column with a header (title, count, menu), a vertical scroll of cards, and an add-card affordance. Cards show cover, labels as color chips, title, and badges (due date, checklist progress, comment count, member avatars). A card modal opens over a dimmed board for details. A right board menu holds activity and settings. Board presence avatars sit in the board header.

The board is the only horizontally scrolling region. The page body never scrolls sideways.

### 8.3 Drag and drop

`@dnd-kit` sortable contexts: one for lists at the board level, one per list for cards. Give every list a droppable of its own in addition to its sortable context, otherwise an empty list is not a valid drop target and cards cannot be moved into it.

On drop, apply the move optimistically in the Zustand store, emit `card:move` or `list:move` with neighbor ids, and reconcile when the authoritative `card:moved` or `list:moved` arrives. If the server position differs from the optimistic guess, snap to the server order without a visible flicker. Keyboard drag is supported through `@dnd-kit` sensors.

The optimistic path may compute a provisional key locally so that one sort comparator drives both provisional and authoritative state. That key never leaves the client, which is what rule 9 forbids. Handle `dragOver` as well as `dragEnd`, so the card visibly follows the cursor across lists, and read the final neighbors off the already-reordered store at `dragEnd` rather than recomputing them from the drop event.

Any interactive control that mutates through the network needs an optimistic local update, not just the drag path. A checkbox bound to server state with no optimistic write visibly reverts for the duration of the round trip.

### 8.4 Locked copy strings

| Key | String |
| --- | --- |
| board.addList | Add another list |
| board.addList.placeholder | Enter list title |
| list.addCard | Add a card |
| list.addCard.placeholder | Enter a title for this card |
| card.description.placeholder | Add a more detailed description |
| card.comment.placeholder | Write a comment |
| card.due.label | Due date |
| card.checklist.add | Add checklist |
| card.attachment.add | Attach a file or link |
| card.archived | This card is archived. |
| board.members.invite | Invite |
| board.visibility.private | Private |
| board.visibility.workspace | Workspace |
| board.visibility.public | Public |
| activity.empty | No activity yet. |
| search.placeholder | Search cards on this board |
| search.empty | No cards match your filters. |
| notifications.empty | You have no notifications. |
| auth.register.cta | Sign up |
| auth.login.cta | Log in |
| error.generic | Something went wrong. Try again. |
| board.presence.viewing | Viewing now |

---

## 9. Backend Build (phased tasks)

### Phase 0: Workspace and infra
1. Init the monorepo, TypeScript base, lint and format, `.env.example` per 6.1, and `.dockerignore` per 18.4.
2. Scaffold `packages/shared` with a dual ESM and CJS build, bundling `fractional-indexing` into the CJS output, and the ordering helpers.
3. Write `docker-compose.yml` with postgres 16 and redis 7.

Acceptance: install succeeds, infra runs, shared builds, and requiring the CJS build from a plain Node 20 script succeeds (this is what catches 18.2). Ordering helpers unit tested: `positionBetween(null,null)`, appends, a 100 item seed that stays ordered and unique, and the measured claim in 5.3 that 60 same-gap inserts stay well under 50 characters.

### Phase 1: Prisma and seed
4. Scaffold `apps/api` NestJS with `PrismaModule` and `RedisModule`.
5. Add `schema.prisma` per 6.2, generate the initial migration, add the card search migration.
6. Write `prisma/seed.ts` per 6.2 using `generateNKeysBetween` for list and card positions.

Acceptance: migrations apply, the seed runs twice in a row with the same result, and a query confirms the board reads back in list and card order.

### Phase 2: Shared contracts
7. Author all Zod schemas and types for 6.3 and 6.4, `WS_EVENTS`, `ERROR_CODES`, `ACTIVITY_TYPES`, the locked copy, the mention parser, and the label palette.

Acceptance: importing `@trello-clone/shared` typechecks in both apps, and the mention parser tests in 6.5 pass.

### Phase 3: Auth and permissions
8. Implement register, login, rotating refresh, logout, `/auth/me`, the access guard, `@CurrentUser()`, the throttler from 6.6, and the global exception filter.
9. Implement the permission service enforcing the section 6.7 model, used by every board scoped endpoint.

Acceptance: e2e registers, logs in, refreshes, and asserts the consumed refresh cookie is rejected on replay; a non member is rejected from an existing private board with `FORBIDDEN`; a board id that does not exist returns `NOT_FOUND`.

### Phase 4: Workspaces and boards
10. Implement workspaces, members, invites, join, and `GET /users/search`.
11. Implement board create (seeding default labels), the single `GET /boards/:id` bootstrap payload, update, close, reopen, star, and board membership.

Acceptance: e2e creates a workspace and board, asserts six labels and the exact bootstrap payload keys, enforces the visibility matrix across two users (workspace board unreachable outside the workspace, readable but not editable inside it, public board readable by any authenticated user and editable by none of them), asserts a closed board rejects content mutations, and asserts demoting the last admin returns `CONFLICT`.

### Phase 5: Lists, cards, and the ordering engine
12. Implement list create, update, archive, and `move` using the section 5 transaction with the board advisory lock, row locks, stale neighbor resolution, and two-phase rebalancing.
13. Implement card create, update, archive, and `move` (within and across lists) using the same ordering engine.
14. Write an `Activity` row in the same transaction for every mutation.

Acceptance: the six tests enumerated in 5.6, all green.

### Phase 6: Card details
15. Implement labels, card labels, card members, checklists and items (ordered), comments with mention parsing and notifications, and attachments with presign and cover.

Acceptance: e2e adds a label and member, creates a checklist with items and toggles progress, posts a comment mentioning a user and asserts a `mention` notification, asserts a self mention notifies nobody, presigns and links an attachment as cover, and asserts an oversized presign returns `UPLOAD_TOO_LARGE`.

### Phase 7: Activity, notifications, search
16. Implement board and card activity feeds, the notifications endpoints, the due soon sweep from 2.1, and the board card search with combinable label, member, and due filters over the tsvector index.

Acceptance: e2e reads both feeds and asserts cursor pages do not overlap, marks a notification read and marks all read, searches by a title word and by a description word, asserts stemming matches a different word form, combines a label filter with a member filter and returns only the intersection, and asserts search on an unreachable board returns `FORBIDDEN`. The due soon sweep is tested by invoking the sweep method directly against a card due inside the window: assert one notification for the assignee, and assert a second invocation creates none.

### Phase 8: Realtime gateway and presence
17. Add the socket.io gateway with the Redis adapter, handshake authentication in connection middleware per 18.1, `board:open` authorization and room join, and board presence broadcasting viewer lists.
18. Implement `card:move`, `list:move`, and `card:update` handlers delegating to the shared services and broadcasting the authoritative payloads plus `activity:new`, emit `notification:new` to user rooms, and emit `board:members_changed` on membership changes.

Acceptance: an integration test with two socket clients on one board. A client that emits `board:open` in the same tick it observes `connect` is admitted, not rejected (this is the regression test for 18.1). A move by client A yields `card:moved` for B with the authoritative position matching what the REST bootstrap then returns. A planted deep gap produces `list:reordered` carrying the full ordered id list. Presence shows both viewers. A socket with no token receives `error` with `UNAUTHENTICATED`. A non member's `board:open` receives `error` with `FORBIDDEN` and does not disconnect the socket.

---

## 10. Frontend Build (phased tasks)

### Phase 9: Web foundation
19. Scaffold `apps/web` (Next.js 15, App Router, TS, Tailwind v4). Apply tokens and the label palette.
20. Build the REST client with token attach and a single shared refresh retry, and the socket client keyed by `WS_EVENTS`.
21. Set up TanStack Query and the normalized Zustand board store (lists and cards keyed by id with ordered id arrays).

Acceptance: the app boots, an unauthenticated visit redirects to auth, and a reload of an authenticated page restores the session from the refresh cookie without a visible bounce through the login screen.

### Phase 10: Auth, dashboard, board bootstrap
22. Build register, login, and the workspace dashboard listing boards and starred boards.
23. Build the board view: fetch the bootstrap payload, hydrate the store, render lists and cards ordered, and open a board socket.

Acceptance: log in, open a board, see lists and cards in order.

### Phase 11: Drag and drop
24. Wire `@dnd-kit` for list and card sorting per section 8.3, optimistic store updates, emit moves with neighbor ids, and reconcile authoritative `moved` and rebalance events.
25. Apply live events from other clients into the store.

Acceptance: store unit tests cover hydrate ordering, an authoritative cross list move, an optimistic move, and the case where the server order contradicts the optimistic guess and the store snaps to the server. A Playwright test drags a card within a list and across lists and asserts the order survives a reload. A second Playwright test with two browser contexts asserts a drag in one session reaches the other and both converge on the same order.

### Phase 12: Card modal and details
26. Build the card modal: markdown description with preview, labels, members, checklists with progress, comments with mention autocomplete, attachments and cover, due date with complete toggle, and archive.
27. Build board members, invites, visibility and background settings, activity panel, board search with filters, and the notifications menu.

Acceptance: a Playwright test with two browser contexts edits a description, adds a label, adds and ticks a checklist item, and posts a comment mentioning the second user, asserting the mention reaches the second session's notification badge live. A second test asserts board search hides non matching cards and restores them when cleared.

---

## 11. Infrastructure and Deploy (phased tasks)

### Phase 13: Containers and CI
28. Write Dockerfiles for api (entrypoint runs migrations then boots) and web (Next standalone), plus `docker-compose.prod.yml`. Both build from the repo root so the shared workspace package resolves. Honor 18.3, 18.4, and 18.5.
29. Write `nginx/nginx.conf`: `/api` and the socket.io path to the api with WebSocket upgrade headers, everything else to web, TLS assumed.
30. Write `.github/workflows/ci.yml`: install, lint, typecheck, run api and web tests, run the Playwright suite against the built apps, build images. The deploy job is defined but gated per rule 4 and only prints commands.

Acceptance: CI passes on a clean checkout. `docker compose -f docker-compose.prod.yml up` serves the app end to end locally, and the Playwright suite passes when pointed at the containerized stack through nginx on port 80, which is what proves the websocket upgrade path is correct. Confirm the api image does not contain a `.env` file.

---

## 12. Definition of Done (per area)

- Auth and permissions: register, login, rotating refresh with replay rejection, throttled auth surface, the full board and workspace permission matrix.
- Workspaces and boards: create, members, invites, visibility, backgrounds, stars, close and reopen, the single bootstrap payload, user search for the member picker.
- Ordering: server authoritative fractional positions, board advisory lock plus row locked move transactions, cross list moves, stale neighbor resolution, two-phase rebalancing, and all six tests in 5.6 green.
- Lists and cards: create, edit, archive, move, all live.
- Card details: labels, members, checklists with progress, markdown descriptions, comments with mentions, attachments and cover, due dates.
- Realtime: every mutation broadcast to board viewers, optimistic drag reconciled to server order, presence, board membership changes reaching open clients, and per user notifications.
- Activity, notifications, search: feeds with cursor paging, read state, the due soon sweep, and combinable board filters.
- Client: `@dnd-kit` drag within and across lists including into an empty list, normalized store, optimistic updates on every networked control, only the locked copy strings used, original neutral design.
- Tests: api and web suites green, ordering tests green, at least one two client realtime drag integration test green at the API level and one at the browser level.
- Packaging: images build, the api image carries no `.env`, and the containerized stack passes the browser suite through nginx.

---

## 13. Scaling Notes (not blocking)

- Sockets scale horizontally via the Redis adapter; any api instance broadcasts to a board room.
- Ordering writes are single row and cheap; rebalances are rare and bounded to one scope. Keep the 50 character key threshold.
- The board advisory lock serializes ordering per board, not globally. Contention is bounded by the number of people dragging on one board at once, which is small.
- The board bootstrap is one query set; for very large boards, paginate archived cards and lazy load card details on modal open (already the design).
- Postgres: index coverage is defined on boardId, listId, the ordering pairs, and the due date sweep.
- Attachments served from the CDN, never through the api.

---

## 14. Non-goals and Anti-patterns

- Do not let the client compute or send `position` to the server. Neighbor ids only; the server owns the key.
- Do not renumber siblings on every move. Fractional indexing is the whole point.
- Do not add a second realtime path. WebSocket plus the Redis adapter is the design. When something needs to reach open clients and no event covers it, add an event to 6.4 rather than polling.
- Do not add a state library beyond Zustand and TanStack Query, and do not use react-beautiful-dnd.
- Do not hardcode event names or error codes. Use the shared maps.
- Do not generate or trace logos. Use the original glyph and an icon library.
- Do not add a worker service or a message queue. The one scheduled sweep in 2.1 runs in the API process and is the only exception.
- Do not weaken the ordering unique indexes to make rebalancing easier. Use the two-phase write in 5.3.
- Do not silence a failing acceptance test by loosening the assertion. If the criterion is wrong, say so in the phase report and fix the criterion.

---

## 15. Commands Reference

```
pnpm install
pnpm --filter @trello-clone/shared build
pnpm --filter api prisma:migrate
pnpm --filter api prisma:seed
pnpm --filter api dev
pnpm --filter web dev
pnpm test
pnpm --filter api test:e2e
pnpm --filter web exec playwright test
docker compose up postgres redis
docker compose -f docker-compose.prod.yml build
```

---

## 16. What the Human Must Supply

Only these.

1. `SPACES_KEY`, `SPACES_SECRET`, and the real Spaces endpoint, region, bucket, and public base URL.
2. `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` for production.
3. The production domain and TLS setup for nginx.
4. Approval to run the gated deploy job.

---

## 17. Open Decisions (the only ones left)

Optional, non blocking. Default to the first option and note the choice in the phase report.

1. Default board visibility on create: default workspace. Alternative: private.
2. Observer role can comment: default yes. Alternative: read only.
3. Card cover from an uploaded image: default enabled. Alternative: color covers only.
4. Board background images: default color only in v1. Alternative: allow an uploaded image background (reuses the presign flow).

Proceed with the defaults.

---

## 18. Known Hazards

Seven traps that a correct reading of version 1.0 still walks into. Each one below cost real debugging time in a full build, and each is cheap to avoid if you know about it first.

### 18.1 Socket authentication must run as middleware, not in the connection handler

The natural implementation authenticates inside `handleConnection`, which is `async` because it verifies a JWT and loads a user. The client observes `connect` as soon as the transport is established, which is before that async work finishes. A client that emits `board:open` immediately on `connect`, exactly as the 6.4 handshake describes, therefore arrives while the server still has no session for the socket, and the handler rejects it with `UNAUTHENTICATED`. The socket stays connected, never joins the board room, and receives no events for the rest of its life. Nothing errors on the server, so this presents as "realtime silently does not work for some clients" and is miserable to track down.

Authenticate in `io.use()` connection middleware instead. Middleware completes before the client sees `connect`, so the session and the `user:<id>` room membership are guaranteed to exist before any event can arrive. To keep the 6.4 error contract, do not reject in the middleware: mark the socket unauthenticated, let it connect, then emit `error` with `UNAUTHENTICATED` and disconnect in the connection handler.

The regression test is in phase 8: connect and emit `board:open` with no delay, and assert the client is admitted.

### 18.2 `fractional-indexing` is ESM only

Version 3 ships ESM only. NestJS compiles to CommonJS, and Node 20 cannot `require()` an ES module, so the CJS build of the shared package throws at runtime on the target runtime. Node 22 and newer permit `require(ESM)` experimentally, which means this can pass locally on a modern Node and fail only inside the Node 20 container. Bundle the dependency into the shared package's CJS output rather than leaving it external.

### 18.3 Prisma needs an explicit musl target and OpenSSL on Alpine

`node:20-alpine` has neither the glibc engine Prisma downloads by default nor a detectable OpenSSL. The failure is not a missing-binary message: it surfaces as `Could not parse schema engine response: SyntaxError: Unexpected token 'E'`, which reads like a Prisma bug and is not searchable. Set `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` in the generator and `apk add --no-cache openssl libc6-compat` in the image.

### 18.4 `.dockerignore` is not optional

`COPY apps/api` copies a developer's local `.env` into the image if one exists. That file then wins over the compose environment, so a container built on a developer machine points at that developer's database URL and ships their secrets inside the image. Add `.dockerignore` covering `**/.env`, `**/.env.*` (with an exception for `.env.example`), `node_modules`, `dist`, `.next`, and test output, before the first image build.

### 18.5 Keep tests and Prisma out of the Nest build

If the api `tsconfig.json` includes `prisma` and `test` alongside `src`, TypeScript widens the inferred root directory and emits to `dist/src/main.js` instead of `dist/main.js`, breaking every `CMD` and start script that names the entrypoint. Add a `tsconfig.build.json` that includes only `src` and excludes tests, which is what `nest build` picks up.

Similarly, scope the web unit test runner to `src`. A default Vitest configuration also collects the Playwright specs under `e2e`, which fail immediately under the wrong runner and make a green suite look broken.

### 18.6 Optimistic updates are a correctness concern for tests, not just polish

A control bound directly to server state with no optimistic write reverts visibly until the response lands. Browser automation asserts state in the same tick as the click, so such a control fails an entirely reasonable test while the feature works. Rather than loosening the assertion, add the optimistic update: write the cache synchronously in the mutation's `onMutate` before any `await`, since an awaited call inside `onMutate` lands after the re-render that the click already triggered.

### 18.7 Local services shadow the compose ports

Covered in 6.1. Worth repeating because the symptom is misleading: the containers report healthy and the ports appear bound, but every connection reaches the developer's local PostgreSQL or Redis, so migrations apply to the wrong database and version-specific behavior differs from the locked stack. Check `select version()` over TCP before trusting anything else. Related: a prod compose file run in the same directory as the dev one shares a project name and therefore its volumes, so it inherits the dev database and its credentials. Run it under an explicit separate project name.

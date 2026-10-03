# Work the queue with your agent

Your sandbox at [demo.sub-zero.dev](https://demo.sub-zero.dev) has already hit
five production faults, and each one filed its own incident in your SubZero
project. Nobody typed a ticket. This repo is the code that crashed. Point your
agent at it and at the queue, and let it finish the job.

## 1. Connect your agent

The welcome page in your sandbox has the exact setup for Claude Code, Cursor and
Codex. In short, any MCP-capable agent runs SubZero's adapter:

```bash
npx -y @sub-zero/agent-mcp
# with SUBZERO_API_URL=https://api.sub-zero.dev
#      SUBZERO_AGENT_TOKEN=<the sz_agent_ credential from SubZero → Agents>
```

Ask it to call `connection_status` first. It should name your project.

## 2. Run the app locally

Your agent needs to reproduce each fault before it fixes it.

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm --filter @trello-clone/shared build
pnpm --filter api prisma:migrate
pnpm --filter api prisma:seed       # ada@example.com / password123
pnpm --filter api dev               # api on :4000
pnpm --filter web dev               # web on :3000
```

Locally nothing is reported to SubZero — the `SUBZERO_*` lines in `.env` are
empty on purpose. Reports come from the hosted sandbox.

## 3. Let it work

Each ticket carries the method, the route, the stack and the user who hit it.
A good run, per ticket:

1. **Take it** (`list_available`, `take_ticket`, `get_ticket`).
2. **Reproduce it.** If the agent cannot make the fault happen again, it does not
   yet know what the fault is.
3. **Fix the cause, not the symptom.** A `try/catch` that swallows the error, or
   an `?? []` that hides it, closes the ticket and leaves the bug.
4. **Prove it with a test** that fails on the current code and passes on the fix
   (`pnpm --filter api test:e2e`).
5. **Resolve it with what it learned** (`resolve_ticket`): the cause, the fix, and
   how it proved it. "Fixed" is not a resolution note.

Leave `apps/api/src/common/sub-zero.notifier.ts` alone — silencing the reporter
is not a fix.

## What you are looking for

The faults are spread across difficulty on purpose. One crashes the moment you
touch the feature. One only fires for a particular filter value. Two need a
specific state first. One will not appear on a small board at all. They are all
in `apps/api/src`, none is a typo or a config value, and every one is the kind
of thing that gets written on a Friday and reviewed on a Monday.

Right now `pnpm --filter api test:e2e` is not green. When your agent is done, it
should be — with a new test for every fix.

Everything else in the app is fair game too: break something new in your
sandbox and it lands in the same queue.

# Deploying demo.sub-zero.dev

The demo runs under PM2 on the droplet that also runs the SubZero API, the same
way SubZero does: no Docker, the host's Postgres, the host's nginx. Every push
to `main` is deployed by `.github/workflows/deploy.yml` once it typechecks and
lints.

The deploy is deliberately not gated on CI. The e2e suite fails until the
planted faults are fixed — that is the demo — so CI stays red on `main`.

## How the pieces fit

```
prospect ──▶ demo.sub-zero.dev (host nginx, TLS)
               ├─ /api, /socket.io ─▶ 127.0.0.1:3101  pm2: subzero-demo-api
               └─ everything else ──▶ 127.0.0.1:3100  pm2: subzero-demo-web
api ──POST /demo/provision──▶ api.sub-zero.dev   (once per signup, shared secret)
api ──POST /incidents/external──▶ api.sub-zero.dev   (each crash, with that
                                                     prospect's ingest key)
```

What a deploy does:

1. GitHub Actions typechecks and lints, then builds the Next.js web app into a
   self-contained bundle (a Next build would starve production SubZero on the
   droplet) and copies it to `/root/subzero-demo/releases/web.tgz`.
2. Over SSH, `/root/subzero-demo/app` (a checkout of this repo) is reset to the
   pushed commit, the API is installed and built there — like SubZero's own
   `npm ci && npm run build` — and its Prisma migrations run.
3. The web bundle is unpacked to `/root/subzero-demo/web`, PM2 reloads both
   processes from `deploy/ecosystem.config.cjs`, and the job waits for both to
   answer.

A signup at `/start` asks SubZero for a project, a login scoped to it and an
ingest key, seeds the prospect's workspace here, and replays a normal first
session so the queue already has incidents. Sandboxes expire after 14 days;
SubZero's hourly sweep then disables the login, agent tokens and ingest key.

## One-time setup

1. **SubZero API.** Merge and deploy the `demo-tenants` PR (it adds
   `POST /demo/provision`), with `DEMO_PROVISION_SECRET` in its `.env`. Until
   then signups fail with "Could not set up your SubZero sandbox".

2. **DNS.** An `A` record for `demo.sub-zero.dev` pointing at the droplet.

3. **A database** on the host Postgres, separate from SubZero's:

   ```bash
   DEMO_DB_PASSWORD=$(openssl rand -hex 24); echo "$DEMO_DB_PASSWORD"
   su postgres -c "psql -c \"CREATE ROLE subzero_demo LOGIN PASSWORD '$DEMO_DB_PASSWORD'\""
   su postgres -c "createdb -O subzero_demo subzero_demo"
   ```

4. **Redis** for live board updates and signup rate limits. The droplet's
   existing Redis is shared with other apps, so the demo namespaces its
   socket.io channel with `SOCKET_IO_REDIS_KEY` (pub/sub is server-wide,
   whatever the database number) and prefixes its own keys with `demo:`.

   **Node.** The droplet's system Node is 18.7, older than Next.js 15 and
   pnpm 9 allow. The demo runs on the nvm Node 20 at
   `/root/.nvm/versions/node/v20.20.0`, as safe-parlay, koryo and ascend do;
   the workflow and `deploy/ecosystem.config.cjs` both pin it.

5. **The demo's `.env`**, at `/root/subzero-demo/.env` (mode 600). The deploy
   links it into the API, and refuses to run without it:

   ```bash
   mkdir -p /root/subzero-demo && cd /root/subzero-demo
   cat > .env <<EOF
   NODE_ENV=production
   API_PORT=3101
   API_HOST=127.0.0.1
   DATABASE_URL=postgresql://subzero_demo:<DEMO_DB_PASSWORD>@127.0.0.1:5432/subzero_demo
   REDIS_URL=redis://127.0.0.1:6379
SOCKET_IO_REDIS_KEY=subzero-demo-socket.io
   JWT_ACCESS_SECRET=$(openssl rand -hex 32)
   JWT_REFRESH_SECRET=$(openssl rand -hex 32)
   JWT_ACCESS_TTL=15m
   JWT_REFRESH_TTL=14d
   WEB_ORIGIN=https://demo.sub-zero.dev
   COOKIE_DOMAIN=demo.sub-zero.dev
   UPLOAD_MAX_BYTES=5242880
   DEMO_MODE=true
   SUBZERO_URL=https://api.sub-zero.dev/incidents/external
   SUBZERO_DEMO_PROVISION_URL=https://api.sub-zero.dev/demo/provision
   DEMO_PROVISION_SECRET=<the same value as in the SubZero API .env>
   DEMO_REPO_URL=https://github.com/Ascendant-Finance/subzero-demo
   SUBZERO_DASHBOARD_URL=https://dashboard.sub-zero.dev
   SUBZERO_PUBLIC_API_URL=https://api.sub-zero.dev
   # optional
   DEMO_LEAD_WEBHOOK_URL=
   KORYO_CAPTURE_KEY=<kor_cap_… from Koryo, SubZero workspace, slug subzero-demo>
   SPACES_ENDPOINT=
   SPACES_REGION=
   SPACES_BUCKET=
   SPACES_KEY=
   SPACES_SECRET=
   SPACES_PUBLIC_BASE_URL=
   EOF
   chmod 600 .env
   ```

   `API_HOST=127.0.0.1` matters: without it the API listens on every interface
   and port 3101 is reachable from the internet, around nginx. Without the
   Spaces values attachments are disabled; everything else works.

6. **nginx and TLS:**

   ```bash
   cp /root/subzero-demo/app/deploy/nginx/demo.sub-zero.dev.conf /etc/nginx/sites-available/
   ln -s ../sites-available/demo.sub-zero.dev.conf /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   certbot --nginx -d demo.sub-zero.dev
   ```

   (The checkout exists after the first deploy; before that, copy the file from
   GitHub.)

7. **SSH access for the workflow.** The organization's `CRYPTOPAY_PORTAL_*`
   secrets are shared with private repositories only, and this repo is public,
   so the workflow has its own key instead: repository secrets `DEMO_DO_HOST`,
   `DEMO_DO_USERNAME` and `DEMO_DO_SSH_KEY`. Its public half is the line in
   `/root/.ssh/authorized_keys` commented
   `subzero-demo GitHub Actions deploy`. Delete that line to cut the demo's
   access without touching any other deploy.

Then re-run the latest **Deploy demo.sub-zero.dev** workflow from the Actions
tab, or push to `main`.

## Operating it

```bash
pm2 status
pm2 logs subzero-demo-api
pm2 logs subzero-demo-web
```

Leads are in SubZero's `demo_tenants` table (and in the webhook, if set):

```sql
SELECT email, name, company, created_at, expires_at FROM demo_tenants ORDER BY created_at DESC;
```

Limits: 5 signups per IP per hour and 200 per day, set by
`DEMO_SIGNUPS_PER_IP_PER_HOUR` and `DEMO_SIGNUPS_PER_DAY` in the `.env`.

## Guided Cocoa demo (disabled by default)

The welcome page now offers one hosted fix and one explicit retry. The first
scenario clears a card description. The existing MCP setup remains under
**Use my own agent**. Cocoa changes a disposable private copy; the shared Stacks
application keeps its planted bugs for subsequent prospects. A five-minute
preview reruns the repaired feature, and the patch/evidence remain readable
until the prospect's demo expires.

This is a separate demo allowance, not a free subscription or bypass of paid
Cocoa's workspace billing. The demo frontend never receives a model key, runner
secret or agent credential. The API derives the project from the authenticated
prospect, not a project supplied by their browser.

Deploy the companion SubZero API migration/module before this UI. The existing
`DEMO_PROVISION_SECRET` connects the demo backend to `/demo/cocoa/:project`.
No extra credentials belong in the browser or this demo's `.env`.

Configure on **SubZero API**:

```
DEMO_COCOA_ENABLED=false
DEMO_COCOA_API_KEY=<separate platform-funded OpenAI project key>
DEMO_COCOA_MODEL=<compatible text model>
DEMO_COCOA_RUNNER_SECRET=<random secret at least 32 characters>
DEMO_COCOA_REVISION=<full immutable SHA of this demo repository>
DEMO_COCOA_PROSPECT_CENTS=100
DEMO_COCOA_DAILY_CENTS=2500
DEMO_COCOA_INPUT_USD_PER_MILLION=<verified upper-bound input price>
DEMO_COCOA_OUTPUT_USD_PER_MILLION=<verified upper-bound output price>
```

The $1 prospect and $25 daily values are initial configurable defaults, not
Stripe prices. Each of two attempts reserves half the prospect allowance before
queueing; reservations are never refunded automatically. One model request per
attempt uses bounded input and output. Unknown/time-out results require the
prospect's explicit retry and still consume the reservation. Prices must cover
all billable tokens for the configured model, including reasoning tokens where
applicable. Also configure the provider project's own spending controls.

The coding runner belongs on a **separate disposable Linux VM**, with Docker
and preferably the `runsc` (gVisor) runtime. Standard Docker is supported only
with the explicit opt-in below and provides weaker isolation. Never give the demo API a Docker socket or run
model-generated application code directly on the SubZero production server.
Allow outbound HTTPS from the trusted runner to SubZero. The application
containers themselves have no external network, no provider keys, a read-only
root, no Linux capabilities, and per-container CPU/memory/PID limits. Their
Postgres and Redis are temporary processes in the same isolated container.
Plan at least 4 GB RAM for the runner VM/builds; the application container is
limited to 1.5 GB, one CPU and 256 tasks. One coding run/preview is active globally.

From this repo, build an image from the pinned **buggy** source revision:

```sh
./cocoa-runner/build-image.sh FULL_COMMIT_SHA
```

Keep the returned `sha256:...` image ID and configure the trusted runner:

```
COCOA_DEMO_API_URL=https://api.sub-zero.dev
COCOA_DEMO_RUNNER_SECRET=<same runner secret as SubZero API>
COCOA_DEMO_REVISION=<same full SHA as SubZero API>
COCOA_DEMO_IMAGE=sha256:<immutable local image ID>
COCOA_DEMO_RUNTIME=runsc
```

For an explicitly approved deployment without gVisor, set both:

```sh
COCOA_DEMO_RUNTIME=runc
COCOA_DEMO_ALLOW_STANDARD_DOCKER=true
```

There is no automatic fallback if gVisor is missing. Standard Docker retains
network isolation, a read-only root, a non-root container user, dropped
capabilities, no-new-privileges, resource limits and a fixed source-file mount.
It shares the host kernel; a separate runner host remains recommended.

Start `node cocoa-runner/runner.mjs` under a dedicated service account on that
VM. Docker access is privileged host access: do not share this account with
untrusted workloads. Its immutable image contains the original code, offline
build dependencies and an independently maintained verification probe. Only
`cards.service.ts` may be patched. A separate probe process verifies the original
500 response, then null persistence, preserved titles/descriptions, ordinary text
updates and authentication after the patch. Agent-reported success is insufficient.

The runner sends a heartbeat; without a recent heartbeat, the UI offers the
existing own-agent path. Enable `DEMO_COCOA_ENABLED` only after a staging run
passes with a real platform key and the selected sandbox runtime. No subscriptions or
customer model keys are needed. The runner does not expose a general shell or
public container endpoint. The preview is a scoped action in the prospect's
existing session, not a shareable URL into the container.

A run has a 12-minute lease and an independent 11-minute container deadline.
Queued work expires after 15 minutes. After a successful fix, previews last up
to five minutes within that overall deadline. A restart destroys the runner's
leftover named containers and does not silently repeat model requests. Use a
single runner process initially. Prospects can revisit saved results; expired
demo accounts cannot start, inspect or preview runs.

Verification commands:

```sh
node --test cocoa-runner/policy.test.mjs
pnpm --filter web exec vitest run src/components/__tests__/cocoa-demo.test.tsx
# In SubZero API after building:
node test/demo-cocoa.integration.cjs
```

RDK publication is deliberately not automatic: this demo stores verified patch
and test evidence with its run and SubZero resolution note. Publishing that
material as reusable approved knowledge remains a separate review step.

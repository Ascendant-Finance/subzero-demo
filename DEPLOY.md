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

# Deploying demo.sub-zero.dev

The demo runs as a Docker Compose stack on the droplet that also runs the
SubZero API, behind that droplet's nginx. Every push to `main` is deployed by
`.github/workflows/deploy.yml` once it typechecks and lints: GitHub Actions
builds both images, pushes them to GHCR, and the droplet pulls and restarts.
Nothing is built on the droplet.

The deploy is deliberately not gated on CI. The e2e suite fails until the
planted faults are fixed — that is the demo — so CI stays red on `main`.

## How the pieces fit

```
prospect ──▶ demo.sub-zero.dev (host nginx, TLS)
               ├─ /api, /socket.io ─▶ 127.0.0.1:3101  api container
               └─ everything else ──▶ 127.0.0.1:3100  web container
api ──POST /demo/provision──▶ api.sub-zero.dev   (once per signup, shared secret)
api ──POST /incidents/external──▶ api.sub-zero.dev   (each crash, with that
                                                     prospect's ingest key)
```

A signup at `/start` asks SubZero for a project, a login scoped to that project
and an ingest key, seeds the prospect's workspace here, and replays a normal
first session so the queue has incidents in it. Every crash a prospect causes is
routed to their project by `SubZeroNotifier.router`. Sandboxes expire after 14
days; SubZero's hourly sweep then disables the login, the agent tokens and the
ingest key.

## One-time setup

1. **DNS.** An `A` record for `demo.sub-zero.dev` pointing at the droplet.

2. **SubZero API.** Deploy the `demo-tenants` branch of subzero-api, which adds
   `POST /demo/provision` and the tenant-isolation fixes, and add one line to its
   `.env` on the droplet, then `pm2 restart subzero`:

   ```bash
   DEMO_PROVISION_SECRET=<openssl rand -hex 32>
   ```

   With the variable unset the route returns 404, so the demo cannot provision.

3. **Docker on the droplet** (skip if `docker compose version` works):

   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

4. **The stack's secrets**, in `/root/subzero-demo/.env` (mode 600):

   ```bash
   mkdir -p /root/subzero-demo && cd /root/subzero-demo
   cat > .env <<EOF
   POSTGRES_PASSWORD=$(openssl rand -hex 24)
   JWT_ACCESS_SECRET=$(openssl rand -hex 32)
   JWT_REFRESH_SECRET=$(openssl rand -hex 32)
   DEMO_PROVISION_SECRET=<the same value as in the SubZero .env>
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

   Without the Spaces values attachments are disabled; everything else works.

5. **nginx and TLS:**

   ```bash
   cp deploy/nginx/demo.sub-zero.dev.conf /etc/nginx/sites-available/
   ln -s ../sites-available/demo.sub-zero.dev.conf /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   certbot --nginx -d demo.sub-zero.dev
   ```

6. **Repository secrets** (Settings → Secrets and variables → Actions):
   `DEMO_DO_HOST`, `DEMO_DO_USERNAME`, `DEMO_DO_SSH_KEY` — the same droplet and
   key the SubZero API deploy uses.

7. **Image visibility.** After the first deploy run pushes the images, make the
   `subzero-demo-api` and `subzero-demo-web` packages public (GitHub → the
   package → Package settings → Change visibility). They hold no secrets — the
   web image bakes in only public URLs — and public images let the droplet pull
   without a registry login.

## Operating it

```bash
cd /root/subzero-demo
docker compose -f docker-compose.demo.yml ps
docker compose -f docker-compose.demo.yml logs -f api
```

Leads are in SubZero's `demo_tenants` table (and in the webhook, if set):

```sql
SELECT email, name, company, created_at, expires_at FROM demo_tenants ORDER BY created_at DESC;
```

Limits: 5 signups per IP per hour and 200 per day, set by
`DEMO_SIGNUPS_PER_IP_PER_HOUR` and `DEMO_SIGNUPS_PER_DAY`.

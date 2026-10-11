# Build on a dedicated runner, from an archive of the operator-pinned demo revision.
FROM node:22-bookworm
ARG DEMO_REVISION
LABEL dev.subzero.cocoa.revision=$DEMO_REVISION
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-15 redis-server && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @trello-clone/shared build && pnpm --filter api prisma:generate
COPY cocoa-runner/container-start.sh /opt/cocoa/container-start.sh
COPY cocoa-runner/probe.mjs /opt/cocoa/probe.mjs
RUN chmod 755 /opt/cocoa/container-start.sh && chmod -R a+rX /app /opt/cocoa
ENV NODE_PATH=/app/apps/api/node_modules:/app/node_modules
ENV PATH=/usr/lib/postgresql/15/bin:$PATH
USER node
ENTRYPOINT ["/opt/cocoa/container-start.sh"]

#!/bin/sh
set -eu
export HOME=/tmp
export DATABASE_URL=postgresql://node@127.0.0.1:5432/cocoa
export REDIS_URL=redis://127.0.0.1:6379
export JWT_ACCESS_SECRET=cocoa-disposable-sandbox-only-access
export JWT_REFRESH_SECRET=cocoa-disposable-sandbox-only-refresh
export API_HOST=127.0.0.1 API_PORT=4000 DEMO_MODE=false NODE_ENV=test
# No customer data, provider keys, ingest keys or production environment are passed in.
initdb -D /tmp/pg --auth=trust >/tmp/database.log 2>&1
pg_ctl -D /tmp/pg -l /tmp/postgres.log -o '-k /tmp -h 127.0.0.1' start >/dev/null
createdb -h 127.0.0.1 cocoa
redis-server --bind 127.0.0.1 --save '' --appendonly no --daemonize yes --logfile /tmp/redis.log
cd /app/apps/api
node node_modules/prisma/build/index.js migrate deploy >/tmp/migration.log 2>&1
node node_modules/typescript/bin/tsc -p tsconfig.build.json --outDir /tmp/api-dist --incremental false >/tmp/build.log 2>&1
exec node /tmp/api-dist/main.js

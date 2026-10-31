#!/usr/bin/env bash
# Bring up the local ORYX dev stack inside a fresh sandbox.
#
# The sandbox restart removes the Postgres binaries and pnpm, and kills the
# running servers. This script restores all three so the ERP mobile work can be
# exercised against the real API and the real database.
#
#   bash scripts/dev-up.sh
#
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN=/usr/lib/postgresql/17/bin
PGDATA="$REPO/.run/pgdata"
PGSOCK="$REPO/.run/pgsock"

export PATH="/acp-node/lib/node_modules/corepack/shims:/usr/local/bin:/usr/bin:/bin"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# ------------------------------------------------------------------ postgres
if [ ! -x "$PGBIN/pg_ctl" ]; then
  echo "==> installing postgresql-17"
  sudo mkdir -p /var/lib/apt/lists/partial
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-17 postgresql-client-17
fi

mkdir -p "$PGSOCK"
chmod 700 "$PGSOCK"
# The restart widens the data directory's mode, which Postgres refuses.
chmod 700 "$PGDATA"

if "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  echo "==> postgres already running"
else
  echo "==> starting postgres"
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$REPO/.run/pg.log" -o "-p 5432 -k $PGSOCK" start
  sleep 5
fi

# ---------------------------------------------------------------------- api
if curl -sf --max-time 3 http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
  echo "==> api already running"
else
  echo "==> building api"
  # `nest build` silently emits nothing when a stale tsbuildinfo claims the
  # output is current. Remove it first.
  rm -f "$REPO/apps/api/tsconfig.build.tsbuildinfo" "$REPO/apps/api/dist/tsconfig.build.tsbuildinfo"
  ( cd "$REPO" && pnpm --filter @oryx/shared build >/dev/null && pnpm --filter @oryx/database build >/dev/null )
  ( cd "$REPO" && pnpm --filter @oryx/api build )
  echo "==> starting api on :3001"
  # setsid detaches from the controlling terminal, so the server survives the
  # shell that started it.
  ( cd "$REPO/apps/api" && set -a && . "$REPO/.env" && set +a && \
    setsid nohup node dist/main.js > "$REPO/.run/api-erp.log" 2>&1 < /dev/null & )
  for _ in $(seq 1 30); do
    sleep 2
    curl -sf --max-time 3 http://127.0.0.1:3001/api/health >/dev/null 2>&1 && break
  done
fi

curl -s --max-time 5 http://127.0.0.1:3001/api/health || echo "api did not come up — see .run/api-erp.log"
echo

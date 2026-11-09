#!/usr/bin/env bash
# Bring the local ORYX stack back up after a sandbox restart.
#
# The container image does not ship PostgreSQL and the package lives outside the
# persisted workspace, so a restart wipes the server binaries while `.run/pgdata`
# survives. This reinstalls the server, starts it against the existing data
# directory, then starts the API and the customer app detached so they outlive
# the invoking shell.
set -u
cd /workspace/project/oryx

PGBIN=/usr/lib/postgresql/17/bin

if [ ! -x "$PGBIN/pg_ctl" ]; then
  echo "[stack] installing postgresql-17"
  sudo apt-get update -qq >/dev/null 2>&1
  sudo apt-get install -y postgresql-17 postgresql-client-17 >/dev/null 2>&1
fi

if ! "$PGBIN/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  echo "[stack] starting postgres"
  chmod 0700 .run/pgdata
  setsid "$PGBIN/pg_ctl" -D /workspace/project/oryx/.run/pgdata -l /tmp/pg.log \
    -o "-p 5432 -k /tmp" start >/dev/null 2>&1 < /dev/null
  sleep 5
fi
"$PGBIN/pg_isready" -h 127.0.0.1 -p 5432

if ! curl -sf -o /dev/null http://localhost:3001/api/health; then
  echo "[stack] starting api"
  # The browser suite performs many logins and rotates sessions heavily, so the
  # default ceilings return 429 and the tests time out at 30s. The docs call for
  # these overrides; set them here so a restarted stack is test-ready.
  setsid env AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000 \
    node apps/api/dist/main.js > /tmp/api.log 2>&1 < /dev/null &
  sleep 12
fi
curl -s -o /dev/null -w "[stack] api health %{http_code}\n" http://localhost:3001/api/health

if ! curl -sf -o /dev/null http://localhost:3002/; then
  echo "[stack] starting customer app"
  (cd apps/customer && setsid corepack pnpm start > /tmp/customer.log 2>&1 < /dev/null &)
  sleep 15
fi
curl -s -o /dev/null -w "[stack] customer %{http_code}\n" http://localhost:3002/

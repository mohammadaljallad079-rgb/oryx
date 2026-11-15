#!/usr/bin/env bash
# Bring the ORYX preview back up from a cold sandbox, from /workspace/project/oryx
# (branch feature/dashboard-modules-redesign). Reinstalls postgres+pnpm if the
# container was recycled, recreates the DB if missing, and starts API/admin/
# customer plus the same-origin proxies on 12000/12001.
set -u
ROOT=/workspace/project/oryx
PGBIN=/usr/lib/postgresql/17/bin
DB=oryx_dev
DBURL="postgresql://oryx:oryx_dev_password@127.0.0.1:5432/$DB?schema=public"
cd "$ROOT" || exit 1

# --- postgres ---
if [ ! -x "$PGBIN/pg_ctl" ]; then
  echo "[stack] installing postgresql-17"
  sudo -n apt-get update -qq >/dev/null 2>&1
  sudo -n apt-get install -y --no-install-recommends postgresql-17 postgresql-client-17 >/dev/null 2>&1
fi
sudo -n service postgresql start >/dev/null 2>&1 || sudo -n pg_ctlcluster 17 main start >/dev/null 2>&1
for i in $(seq 1 20); do timeout 2 bash -c "exec 3<>/dev/tcp/127.0.0.1/5432" 2>/dev/null && break; sleep 1; done

# --- role + db ---
sudo -n -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='oryx'" 2>/dev/null | grep -q 1 \
  || sudo -n -u postgres psql -c "CREATE ROLE oryx LOGIN PASSWORD 'oryx_dev_password' SUPERUSER;" >/dev/null 2>&1
sudo -n -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" 2>/dev/null | grep -q 1 \
  || sudo -n -u postgres createdb -O oryx "$DB" >/dev/null 2>&1

# --- pnpm ---
if ! command -v pnpm >/dev/null 2>&1; then
  mkdir -p "$HOME/.local/bin"
  printf '#!/bin/sh\nexec corepack pnpm "$@"\n' > "$HOME/.local/bin/pnpm"
  chmod +x "$HOME/.local/bin/pnpm"
  export PATH="$HOME/.local/bin:$PATH"
fi

# --- migrate + seed if empty ---
NEED_SEED=$(PGPASSWORD=oryx_dev_password psql -h 127.0.0.1 -U oryx -d "$DB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null || echo 0)
if [ "${NEED_SEED:-0}" -lt 10 ]; then
  echo "[stack] building packages + migrate + seed"
  export DATABASE_URL="$DBURL"
  pnpm --filter @oryx/shared build >/dev/null 2>&1
  pnpm --filter @oryx/database build >/dev/null 2>&1
  pnpm db:generate >/dev/null 2>&1
  pnpm db:migrate >/dev/null 2>&1
  pnpm db:seed >/dev/null 2>&1
fi

port_open() { timeout 2 bash -c "exec 3<>/dev/tcp/127.0.0.1/$1" 2>/dev/null; }

# --- build apps if dist missing ---
[ -f apps/api/dist/main.js ] || { echo "[stack] building api"; NEXT_PUBLIC_API_BASE_URL=/api pnpm --filter @oryx/api build >/dev/null 2>&1; }
[ -f apps/admin/.next/BUILD_ID ] || { echo "[stack] building admin"; NEXT_PUBLIC_API_BASE_URL=/api pnpm --filter @oryx/admin build >/dev/null 2>&1; }
[ -f apps/customer/.next/BUILD_ID ] || { echo "[stack] building customer"; NEXT_PUBLIC_API_BASE_URL=/api pnpm --filter @oryx/customer build >/dev/null 2>&1; }

# --- services ---
export DATABASE_URL="$DBURL" AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000
port_open 3001 || (cd apps/api && setsid nohup node dist/main.js > /tmp/oryx-api.log 2>&1 < /dev/null &)
port_open 3000 || (cd apps/admin && setsid nohup node ../../node_modules/next/dist/bin/next start -p 3000 > /tmp/oryx-admin.log 2>&1 < /dev/null &)
port_open 3002 || (cd apps/customer && setsid nohup node ../../node_modules/next/dist/bin/next start -p 3002 > /tmp/oryx-customer.log 2>&1 < /dev/null &)
sleep 15
port_open 12000 || (PROXY_PORT=12000 WEB_PORT=3000 API_PORT=3001 SHOTS_ROOT=/tmp/oryx-shots setsid nohup node .run/preview-proxy.mjs > /tmp/oryx-proxy-admin.log 2>&1 < /dev/null &)
port_open 12001 || (PROXY_PORT=12001 WEB_PORT=3002 API_PORT=3001 SHOTS_ROOT=/tmp/oryx-shots setsid nohup node .run/preview-proxy.mjs > /tmp/oryx-proxy-customer.log 2>&1 < /dev/null &)
sleep 6
echo "[stack] api=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health) admin=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login) customer=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/) proxy=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:12000/login)"

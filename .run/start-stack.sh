#!/usr/bin/env bash
# Bring the ORYX staging preview up from a cold sandbox.
#
# The sandbox is ephemeral: a restart drops PostgreSQL, nginx and every Node
# service while leaving the workspace (source, built `dist/`, `.next/`, the
# seeded database cluster under `.run/pgdata`) intact. This script restarts each
# piece in dependency order and reports what it started, so a preview can be
# recovered without re-running migrations or the seed.
#
# Usage: bash .run/start-stack.sh
set -u

ROOT=/workspace/project/oryx
RUN="$ROOT/.run"
PG_BIN=/usr/lib/postgresql/17/bin
PGDATA="$RUN/pgdata"

log() { printf '%s\n' "$*"; }

# ---------------------------------------------------------------- postgres
if "$PG_BIN/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  log "postgres: already accepting connections"
else
  "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$RUN/pg.log" -o "-p 5432 -k /tmp" start >/dev/null 2>&1
  for _ in $(seq 1 30); do
    "$PG_BIN/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && break
    sleep 1
  done
  "$PG_BIN/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1 \
    && log "postgres: started" || log "postgres: FAILED to start (see .run/pg.log)"
fi

# --------------------------------------------------------------- services
start_service() {
  local name="$1" dir="$2" cmd="$3" port="$4"
  if ss -ltn 2>/dev/null | grep -q ":$port "; then
    log "$name: already listening on $port"
    return
  fi
  ( cd "$dir" && setsid nohup bash -lc "$cmd" > "$RUN/$name.log" 2>&1 < /dev/null & echo $! > "$RUN/$name.pid" )
  for _ in $(seq 1 60); do
    ss -ltn 2>/dev/null | grep -q ":$port " && break
    sleep 1
  done
  ss -ltn 2>/dev/null | grep -q ":$port " \
    && log "$name: listening on $port" || log "$name: FAILED (see .run/$name.log)"
}

set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a
export AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000

start_service api "$ROOT/apps/api" "node dist/main.js" 3001
start_service admin "$ROOT/apps/admin" "node ../../node_modules/next/dist/bin/next start -p 3000" 3000
start_service customer "$ROOT/apps/customer" "node ../../node_modules/next/dist/bin/next start -p 3002" 3002
start_service mobile-web "$ROOT" "node .run/serve-mobile-web.mjs" 8081

# ------------------------------------------------------------------ nginx
if [ -f "$RUN/nginx.pid" ] && kill -0 "$(cat "$RUN/nginx.pid")" 2>/dev/null; then
  log "nginx: already running (pid $(cat "$RUN/nginx.pid"))"
else
  /usr/sbin/nginx -c "$RUN/nginx.conf" >/dev/null 2>&1
  sleep 2
  [ -f "$RUN/nginx.pid" ] && log "nginx: started (pid $(cat "$RUN/nginx.pid"))" \
    || log "nginx: FAILED (see .run/nginx-error.log)"
fi

log "--- public checks ---"
for url in \
  "https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/login" \
  "https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/" \
  "https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/mobile/"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url")
  log "$code  $url"
done

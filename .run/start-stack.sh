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

# `ss`, `netstat` and `lsof` are absent from the sandbox image, so probe the
# listening port directly. Bash's /dev/tcp needs no external binary.
port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- && return 0
  return 1
}

# ------------------------------------------------------------ prerequisites
# The sandbox image can be recycled between sessions, which removes the
# PostgreSQL server package while leaving the seeded cluster under .run/pgdata.
# Reinstall it rather than re-seeding, so the demo records survive.
if [ ! -x "$PG_BIN/pg_ctl" ]; then
  log "postgres: server package missing, installing"
  sudo -n apt-get update -qq >/dev/null 2>&1
  sudo -n apt-get install -y --no-install-recommends postgresql-17 postgresql-client-17 >/dev/null 2>&1
  if [ -x "$PG_BIN/pg_ctl" ]; then
    log "postgres: installed"
  else
    log "postgres: INSTALL FAILED — no package source available"
  fi
fi

# The packaged cluster is owned by the unprivileged user, so `initdb`-style
# permissions (0700) are required. A reinstall can widen the directory to 2770
# and PostgreSQL then refuses to start.
if [ -d "$PGDATA" ]; then
  chmod 700 "$PGDATA" 2>/dev/null || true
fi

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
  if port_open "$port"; then
    log "$name: already listening on $port"
    return
  fi
  ( cd "$dir" && setsid nohup bash -lc "$cmd" > "$RUN/$name.log" 2>&1 < /dev/null & echo $! > "$RUN/$name.pid" )
  for _ in $(seq 1 60); do
    port_open "$port" && break
    sleep 1
  done
  port_open "$port" \
    && log "$name: listening on $port" || log "$name: FAILED (see .run/$name.log)"
}

set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a
export AUTH_THROTTLE_LIMIT=100000 THROTTLE_LIMIT=1000000 REFRESH_THROTTLE_LIMIT=100000

# `pnpm` is installed through corepack and can disappear with the sandbox image.
if ! command -v pnpm >/dev/null 2>&1; then
  mkdir -p "$HOME/.local/bin"
  printf '#!/bin/sh\nexec corepack pnpm "$@"\n' > "$HOME/.local/bin/pnpm"
  chmod +x "$HOME/.local/bin/pnpm"
  export PATH="$HOME/.local/bin:$PATH"
  log "pnpm: shim restored at $HOME/.local/bin/pnpm"
fi

start_service api "$ROOT/apps/api" "node dist/main.js" 3001
start_service admin "$ROOT/apps/admin" "node ../../node_modules/next/dist/bin/next start -p 3000" 3000
start_service customer "$ROOT/apps/customer" "node ../../node_modules/next/dist/bin/next start -p 3002" 3002
start_service mobile-web "$ROOT" "node .run/serve-mobile-web.mjs" 8081

# ---------------------------------------------------------- preview proxies
# The platform ingress terminates TLS for work-1/work-2 and forwards plain HTTP
# to 12000/12001. One proxy per host serves the app at the origin root and
# routes /api to the API, so the browser sees a single same-origin API and the
# HttpOnly refresh cookie and CSRF double-submit both work without CORS.
start_proxy() {
  local name="$1" port="$2" app="$3"
  if port_open "$port"; then
    log "$name: already listening on $port"
    return
  fi
  ( cd "$ROOT" && PROXY_PORT="$port" APP_PORT="$app" setsid nohup node .run/preview-proxy.mjs \
      > "$RUN/$name.log" 2>&1 < /dev/null & echo $! > "$RUN/$name.pid" )
  for _ in $(seq 1 30); do
    port_open "$port" && break
    sleep 1
  done
  port_open "$port" \
    && log "$name: listening on $port" || log "$name: FAILED (see .run/$name.log)"
}

start_proxy proxy-admin 12000 3000
start_proxy proxy-customer 12001 3002

log "--- public checks ---"
for url in \
  "https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev/login" \
  "https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/" \
  "https://work-2-cpaunenxhadbkkef.prod-runtime.all-hands.dev/mobile/"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$url")
  log "$code  $url"
done

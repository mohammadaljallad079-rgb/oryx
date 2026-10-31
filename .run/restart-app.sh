#!/usr/bin/env bash
# Restart one Next.js preview app without polluting the build environment.
#
# `NEXT_PUBLIC_*` values are inlined at BUILD time. Sourcing the repo `.env`
# into the shell before `next build` therefore bakes `http://localhost:3001/api`
# into the client bundle, which breaks the same-origin preview proxy: the
# refresh cookie is then set on `localhost:3001` while the page runs on the
# proxy origin, so every reload silently signs the user out. This helper keeps
# the API origin out of the environment for both build and start.
#
# Usage: bash .run/restart-admin.sh [--build]
set -u

ROOT=/workspace/project/oryx
APP="${1:-admin}"
DO_BUILD="${2:-}"

case "$APP" in
  admin)    DIR="$ROOT/apps/admin";    PORT=3000 ;;
  customer) DIR="$ROOT/apps/customer"; PORT=3002 ;;
  *) echo "unknown app: $APP"; exit 1 ;;
esac

# Drop anything that could leak into the client bundle.
unset NEXT_PUBLIC_API_BASE_URL NEXT_PUBLIC_API_URL API_URL 2>/dev/null || true

if [ "$DO_BUILD" = "--build" ]; then
  echo "building $APP (clean env)…"
  ( cd "$DIR" && pnpm build ) || { echo "build failed"; exit 1; }
fi

# Stop the existing server for this app, matched by its working directory so no
# other service is touched.
for pid in $(pgrep -f "next-server" 2>/dev/null); do
  [ "$(readlink "/proc/$pid/cwd" 2>/dev/null)" = "$DIR" ] && { echo "stopping $APP pid $pid"; kill "$pid"; }
done
for _ in $(seq 1 20); do
  (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null || break
  sleep 0.5
done

( cd "$DIR" && setsid nohup node "$ROOT/node_modules/next/dist/bin/next" start -p "$PORT" \
    > "$ROOT/.run/$APP.log" 2>&1 < /dev/null & echo $! > "$ROOT/.run/$APP.pid" )

for _ in $(seq 1 60); do
  (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && break
  sleep 1
done

if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  echo "$APP listening on $PORT"
else
  echo "$APP FAILED (see .run/$APP.log)"; exit 1
fi

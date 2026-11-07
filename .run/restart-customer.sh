#!/usr/bin/env bash
# Restart the customer preview after a rebuild.
#
# `next start` spawns a `next-server` child that owns the listening socket and
# outlives its parent. Killing only the launcher leaves that child serving the
# previous `.next` output: the HTML references chunk hashes the rebuild has
# replaced, so every page renders blank and a capture run silently records
# empty screenshots. Kill the child, wait for the port to actually free, then
# start.
set -u

PORT="${1:-3002}"
ROOT=/workspace/project/oryx

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && exec 3>&- && return 0; return 1; }

for pid in $(pgrep -f "next-server" 2>/dev/null); do
  kill -9 "$pid" 2>/dev/null || true
done
for pid in $(pgrep -f "next start -p $PORT" 2>/dev/null); do
  kill -9 "$pid" 2>/dev/null || true
done

for _ in $(seq 1 20); do
  port_open || break
  sleep 1
done

if port_open; then
  echo "customer: port $PORT still held after kill" >&2
  exit 1
fi

cd "$ROOT/apps/customer" || exit 1
setsid nohup node ../../node_modules/next/dist/bin/next start -p "$PORT" \
  > /tmp/customer-start.log 2>&1 < /dev/null &

for _ in $(seq 1 40); do
  port_open && break
  sleep 1
done

if port_open; then
  echo "customer: listening on $PORT"
else
  echo "customer: FAILED to start (see /tmp/customer-start.log)" >&2
  tail -5 /tmp/customer-start.log >&2
  exit 1
fi

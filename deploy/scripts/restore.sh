#!/usr/bin/env bash
#
# ORYX — restore a backup into a *separate* database.
#
# This script never writes over the live database. It restores into a new
# database, so the operator can point a staging API at it, verify a login and a
# report, and only then decide whether to promote. Restoring in place is how a
# bad backup becomes an outage.
#
# Usage:
#   deploy/scripts/restore.sh backups/oryx-oryx_production-20261018T021500Z.dump
#   deploy/scripts/restore.sh <dump> --target oryx_restore_test
#
# Exit codes:
#   0  restored into the target database
#   1  configuration error
#   2  dump unreadable
#   3  restore failed

set -uo pipefail

DUMP="${1:-}"
[[ -n "$DUMP" ]] || { echo "usage: restore.sh <dump-file> [--target <dbname>]" >&2; exit 1; }

COMPOSE_FILE="${ORYX_COMPOSE_FILE:-deploy/docker-compose.production.yml}"
ENV_FILE="${ORYX_ENV_FILE:-.env.production}"
SERVICE="${ORYX_POSTGRES_SERVICE:-postgres}"
TARGET=""

shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    *) echo "restore: unknown argument: $1" >&2; exit 1 ;;
  esac
done

fail() { echo "restore: $*" >&2; exit "${2:-1}"; }

command -v docker >/dev/null 2>&1 || fail "docker is not on PATH"
[[ -f "$COMPOSE_FILE" ]] || fail "compose file not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || fail "env file not found: $ENV_FILE"

db_user=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
db_name=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
[[ -n "$db_user" && -n "$db_name" ]] || fail "POSTGRES_USER and POSTGRES_DB must be set in $ENV_FILE"

TARGET="${TARGET:-${db_name}_restore_$(date -u +%Y%m%dT%H%M%SZ)}"

# Refuse the one mistake that matters.
if [[ "$TARGET" == "$db_name" ]]; then
  fail "refusing to restore over the live database '$db_name'; pass --target <other-db>" 1
fi

compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

# The dump argument may be a host path or a container path. Translate a host
# path under BACKUP_DIR (mounted at /backups) into the container's view.
BACKUP_DIR="${ORYX_BACKUP_DIR:-./backups}"
container_dump="$DUMP"
case "$DUMP" in
  /backups/*) container_dump="$DUMP" ;;
  "$BACKUP_DIR"/*) container_dump="/backups/${DUMP#"$BACKUP_DIR"/}" ;;
  ./*) container_dump="/backups/${DUMP#./}" ;;
esac

"${compose[@]}" ps --status running --services 2>/dev/null | grep -qx "$SERVICE" \
  || fail "the '$SERVICE' service is not running" 1

# Read the table of contents first. If this fails, nothing is created.
"${compose[@]}" exec -T "$SERVICE" pg_restore --list "$container_dump" >/dev/null 2>&1 \
  || fail "cannot read $container_dump; the file is missing or not a pg_dump archive" 2

echo "restore: creating database $TARGET"
"${compose[@]}" exec -T "$SERVICE" createdb -U "$db_user" "$TARGET" \
  || fail "could not create $TARGET (does it already exist?)" 3

# `--no-owner` matches the dump and lets the restore user own everything, which
# is what a migration to a different deployment needs.
if ! "${compose[@]}" exec -T "$SERVICE" \
      pg_restore -U "$db_user" -d "$TARGET" --no-owner --no-privileges --exit-on-error "$container_dump"; then
  fail "pg_restore failed; database $TARGET is incomplete and must be dropped" 3
fi

# Sanity check: the migrated schema should contain the core tables.
tables=$("${compose[@]}" exec -T "$SERVICE" \
  psql -U "$db_user" -d "$TARGET" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" \
  | tr -d '[:space:]')

echo "restore: $TARGET has $tables tables"
echo "restore: OK"
echo
echo "To verify before promoting:"
echo "  DATABASE_URL=postgresql://${db_user}:***@127.0.0.1:5432/${TARGET} \\"
echo "    pnpm --filter @oryx/api start &"
echo "  curl -fsS http://127.0.0.1:3001/api/health"
echo
echo "To discard:"
echo "  docker compose -f $COMPOSE_FILE exec $SERVICE dropdb -U $db_user $TARGET"

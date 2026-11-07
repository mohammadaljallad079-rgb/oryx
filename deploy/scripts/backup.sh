#!/usr/bin/env bash
#
# ORYX — logical database backup.
#
# Writes a compressed custom-format dump to $ORYX_BACKUP_DIR and verifies it is
# readable before declaring success. An unverified backup is not a backup: a
# dump that `pg_restore --list` cannot read will also fail on the day it is
# needed, and that is the worst possible time to discover it.
#
# Usage:
#   deploy/scripts/backup.sh
#   ORYX_BACKUP_DIR=/srv/backups deploy/scripts/backup.sh
#
# Cron (daily 02:15, log to syslog):
#   15 2 * * * cd /srv/oryx && deploy/scripts/backup.sh >> /var/log/oryx-backup.log 2>&1
#
# Exit codes:
#   0  backup written and verified
#   1  configuration error (missing env, no container)
#   2  dump failed
#   3  verification failed — treat the dump as unusable

set -uo pipefail

COMPOSE_FILE="${ORYX_COMPOSE_FILE:-deploy/docker-compose.production.yml}"
ENV_FILE="${ORYX_ENV_FILE:-.env.production}"
BACKUP_DIR="${ORYX_BACKUP_DIR:-./backups}"
RETENTION_DAYS="${ORYX_BACKUP_RETENTION_DAYS:-30}"
SERVICE="${ORYX_POSTGRES_SERVICE:-postgres}"

fail() { echo "backup: $*" >&2; exit "${2:-1}"; }

command -v docker >/dev/null 2>&1 || fail "docker is not on PATH"
[[ -f "$COMPOSE_FILE" ]] || fail "compose file not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || fail "env file not found: $ENV_FILE (copy deploy/env/production.env.example)"

# Read the database name and user without sourcing the file, so a value that
# contains shell metacharacters cannot execute.
db_user=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
db_name=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
[[ -n "$db_user" && -n "$db_name" ]] || fail "POSTGRES_USER and POSTGRES_DB must be set in $ENV_FILE"

compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

"${compose[@]}" ps --status running --services 2>/dev/null | grep -qx "$SERVICE" \
  || fail "the '$SERVICE' service is not running" 1

mkdir -p "$BACKUP_DIR" || fail "cannot create backup directory: $BACKUP_DIR"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="/backups/oryx-${db_name}-${stamp}.dump"
host_target="${BACKUP_DIR%/}/oryx-${db_name}-${stamp}.dump"

echo "backup: dumping $db_name as $db_user -> $host_target"

# Custom format (-Fc) is compressed and supports selective restore. The dump is
# written inside the container's /backups, which is the host BACKUP_DIR mount.
if ! "${compose[@]}" exec -T "$SERVICE" \
      pg_dump -U "$db_user" -d "$db_name" -Fc --no-owner --no-privileges -f "$target"; then
  fail "pg_dump failed; the previous backup is still the newest good one" 2
fi

# Verify: a readable table of contents is the cheapest real proof that the dump
# is complete and not a truncated file.
if ! "${compose[@]}" exec -T "$SERVICE" pg_restore --list "$target" >/dev/null 2>&1; then
  fail "verification failed: pg_restore cannot read $target — do not rely on it" 3
fi

size=$(stat -c%s "$host_target" 2>/dev/null || echo 0)
[[ "$size" -gt 0 ]] || fail "verification failed: $host_target is empty" 3
echo "backup: verified $(numfmt --to=iec "$size" 2>/dev/null || echo "${size}B")"

# Retention. `-mtime +N` prunes files strictly older than N days, so a daily
# schedule keeps N+1 dumps and never deletes today's.
if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [[ "$RETENTION_DAYS" -gt 0 ]]; then
  pruned=$(find "$BACKUP_DIR" -maxdepth 1 -name "oryx-${db_name}-*.dump" -type f \
             -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
  [[ "$pruned" -gt 0 ]] && echo "backup: pruned $pruned dump(s) older than ${RETENTION_DAYS} days"
fi

echo "backup: OK"

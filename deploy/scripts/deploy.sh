#!/usr/bin/env bash
#
# ORYX — deploy a tagged release, with a backup and an automatic rollback.
#
# The sequence is deliberate and each step is a precondition for the next:
#
#   1. record the currently running image tag  (the rollback target)
#   2. take and verify a backup                (the data rollback target)
#   3. build and start the new images
#   4. wait for the health probe to report ok
#   5. on failure, roll back to the recorded tag
#
# A migration is *not* automatically reversed. Migrations in this repository are
# additive; a destructive one would need a hand-written down migration, and
# guessing would be worse than stopping. Step 5 restores the previous images and
# tells the operator what to do about the schema.
#
# Usage:
#   deploy/scripts/deploy.sh 2026.10.19
#   deploy/scripts/deploy.sh 2026.10.19 --skip-backup

set -uo pipefail

TAG="${1:-}"
[[ -n "$TAG" ]] || { echo "usage: deploy.sh <image-tag> [--skip-backup]" >&2; exit 1; }
shift
SKIP_BACKUP=0
[[ "${1:-}" == "--skip-backup" ]] && SKIP_BACKUP=1

COMPOSE_FILE="${ORYX_COMPOSE_FILE:-deploy/docker-compose.production.yml}"
ENV_FILE="${ORYX_ENV_FILE:-.env.production}"
HEALTH_URL="${ORYX_HEALTH_URL:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

step()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail()  { echo "deploy: $*" >&2; exit "${2:-1}"; }

cd "$ROOT_DIR" || fail "cannot enter $ROOT_DIR"
command -v docker >/dev/null 2>&1 || fail "docker is not on PATH"
[[ -f "$COMPOSE_FILE" ]] || fail "compose file not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || fail "env file not found: $ENV_FILE"

compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

# ------------------------------------------------------------------ 1. record
step "Recording the current release"
previous_tag=$("${compose[@]}" images api --format '{{.Tag}}' 2>/dev/null | head -1)
if [[ -z "$previous_tag" || "$previous_tag" == "<none>" ]]; then
  previous_tag=""
  echo "  no previous api image found; this is a first deploy"
else
  echo "  previous tag: $previous_tag"
fi

# -------------------------------------------------------------- 2. backup
if [[ "$SKIP_BACKUP" -eq 1 ]]; then
  step "Skipping the backup (--skip-backup)"
else
  step "Taking a verified backup"
  ORYX_COMPOSE_FILE="$COMPOSE_FILE" ORYX_ENV_FILE="$ENV_FILE" \
    "$SCRIPT_DIR/backup.sh" || fail "backup failed; refusing to deploy without one"
fi

# -------------------------------------------------------------- 3. build/start
step "Building and starting release $TAG"
export ORYX_IMAGE_TAG="$TAG"
if ! "${compose[@]}" up -d --build; then
  fail "compose up failed"
fi

# The migration job runs to completion before the API starts. Surface its log
# and its exit code rather than letting a silent failure look like a slow start.
step "Migration result"
if "${compose[@]}" logs --no-color migrate 2>/dev/null | tail -20; then :; fi
migrate_exit=$("${compose[@]}" ps -a --format '{{.Service}} {{.ExitCode}}' 2>/dev/null \
                 | awk '$1=="migrate"{print $2}' | head -1)
if [[ -n "$migrate_exit" && "$migrate_exit" != "0" ]]; then
  fail "the migration job exited $migrate_exit; the API will not start. Inspect: docker compose -f $COMPOSE_FILE logs migrate" 2
fi

# -------------------------------------------------------------- 4. health
step "Waiting for the API health probe"
if [[ -z "$HEALTH_URL" ]]; then
  # Derive it from the API's own container, so the check does not depend on TLS
  # being ready or on the public host resolving from this machine.
  HEALTH_URL="http://127.0.0.1:${EDGE_HTTP_PORT:-80}$(grep -E '^API_PREFIX=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
  HEALTH_URL="${HEALTH_URL%/}/health"
fi
echo "  probing $HEALTH_URL"

healthy=0
for attempt in $(seq 1 30); do
  body=$("${compose[@]}" exec -T api sh -c \
    "node -e \"fetch('http://127.0.0.1:3001/api/health').then(r=>r.text()).then(t=>{console.log(t);process.exit(0)}).catch(()=>process.exit(1))\"" 2>/dev/null)
  if printf '%s' "$body" | grep -q '"status":"ok"'; then
    healthy=1
    echo "  healthy after ${attempt} attempt(s): $body"
    break
  fi
  sleep 2
done

if [[ "$healthy" -eq 1 ]]; then
  step "Deploy OK — release $TAG is serving"
  echo "  run the full validation with: deploy/scripts/health-check.sh"
  exit 0
fi

# -------------------------------------------------------------- 5. rollback
step "Health probe failed — rolling back"
if [[ -z "$previous_tag" ]]; then
  fail "no previous release to roll back to; the stack is up but unhealthy. Inspect: docker compose -f $COMPOSE_FILE logs api" 3
fi

export ORYX_IMAGE_TAG="$previous_tag"
if "${compose[@]}" up -d --build; then
  echo "  rolled back to $previous_tag"
else
  fail "rollback itself failed; the stack needs manual attention" 4
fi

cat <<EOF

deploy: FAILED and rolled back to $previous_tag.

The database schema was NOT reverted. If release $TAG applied a migration that
the previous release cannot tolerate, restore the backup taken in step 2 into a
separate database, verify it, and promote it deliberately — see
deploy/scripts/restore.sh and docs/DEPLOYMENT.md §8.

Release $TAG is not deployed. Investigate before retrying.
EOF
exit 5

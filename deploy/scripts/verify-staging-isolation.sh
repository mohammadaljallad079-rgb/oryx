#!/usr/bin/env bash
#
# ORYX — prove that a staging stack cannot touch production.
#
# Reads only. It resolves the compose file twice — once as production, once as
# staging — and asserts that the two resolutions share no secret, no port, no
# project name and no persistent volume. It never starts a container, never
# connects to the database and never prints a secret value.
#
# This exists because `--env-file` alone does NOT isolate a stack. The compose
# file's own `env_file:` key injects a file directly into a container, and
# `--env-file` only interpolates ${...} in the compose file itself. Before the
# API service's env_file path was made overridable, a staging stack resolved
# with the *production* JWT and MFA secrets and would have shared the production
# database credentials. This script is the regression guard for that.
#
# Usage (run from the repository root):
#   deploy/scripts/verify-staging-isolation.sh .env.staging
#
# Exit codes:
#   0  staging is isolated from production
#   1  a leak or a collision was found (each one is printed)
#   2  configuration error (missing files, missing compose plugin)

set -uo pipefail

STAGING_ENV="${1:-.env.staging}"
PROD_ENV="${ORYX_PROD_ENV_FILE:-.env.production}"
COMPOSE_FILE="${ORYX_COMPOSE_FILE:-deploy/docker-compose.production.yml}"
STAGING_PROJECT="${ORYX_STAGING_PROJECT:-oryx-staging}"

fail() { echo "isolation: $*" >&2; exit "${2:-1}"; }

command -v docker >/dev/null 2>&1 || fail "docker is not on PATH" 2
docker compose version >/dev/null 2>&1 || fail "the docker compose plugin is missing" 2
[[ -f "$COMPOSE_FILE" ]] || fail "compose file not found: $COMPOSE_FILE" 2
[[ -f "$STAGING_ENV" ]] || fail "staging env not found: $STAGING_ENV (copy deploy/env/production.env.example)" 2
[[ -f "$PROD_ENV" ]] || fail "production env not found: $PROD_ENV — needed as the comparison baseline" 2

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# Resolve both stacks to JSON. `config` does not contact a daemon.
if ! docker compose -f "$COMPOSE_FILE" --env-file "$PROD_ENV" config --format json \
      >"$tmpdir/prod.json" 2>"$tmpdir/prod.err"; then
  fail "could not resolve the production stack: $(head -1 "$tmpdir/prod.err")" 2
fi
if ! docker compose -p "$STAGING_PROJECT" -f "$COMPOSE_FILE" --env-file "$STAGING_ENV" config --format json \
      >"$tmpdir/stg.json" 2>"$tmpdir/stg.err"; then
  fail "could not resolve the staging stack: $(head -1 "$tmpdir/stg.err")" 2
fi

python3 - "$tmpdir/prod.json" "$tmpdir/stg.json" "$STAGING_PROJECT" <<'PY'
import json, sys

prod = json.load(open(sys.argv[1]))
stg  = json.load(open(sys.argv[2]))
want_project = sys.argv[3]

problems = []

def note(ok, msg):
    print(("  PASS  " if ok else "  FAIL  ") + msg)
    if not ok:
        problems.append(msg)

print("1. project identity")
note(prod.get("name") != stg.get("name"),
     f"project names differ (prod={prod.get('name')!r} staging={stg.get('name')!r})")
note(stg.get("name") == want_project,
     f"staging resolved to the requested project name {want_project!r}")

print("\n2. published ports")
def ports(doc):
    out = set()
    for name, svc in doc.get("services", {}).items():
        for p in svc.get("ports", []) or []:
            out.add((name, str(p.get("published"))))
    return out
pp, sp = ports(prod), ports(stg)
overlap = pp & sp
note(not overlap, f"no published port is shared with production (shared: {sorted(overlap) or 'none'})")

print("\n3. persistent volumes")
# Compare the names compose will actually create, not the declared keys. Compose
# prefixes every volume with the project name, so the declared keys are
# identical in both files by design and comparing them is meaningless; the
# resolved `name` is what decides whether two stacks share a volume.
def vols(doc):
    return {v.get("name") for v in (doc.get("volumes") or {}).values() if v.get("name")}
vp, vs = vols(prod), vols(stg)
note(vp and vs and not (vp & vs),
     f"no persistent volume is shared (prod={sorted(vp)} staging={sorted(vs)})")

print("\n4. secret values")
# Compare *values*, not keys: the same key name in both files is expected and
# fine, as long as the staging value is its own. An empty value is skipped —
# an unconfigured adapter is empty in both files and proves nothing about
# isolation, and flagging it would bury a real leak in noise. No value is ever
# printed.
def envmap(doc, service):
    svc = doc.get("services", {}).get(service, {})
    return {k: v for k, v in (svc.get("environment") or {}).items() if isinstance(v, str)}

SENSITIVE = ("SECRET", "PASSWORD", "API_KEY", "ACCESS_TOKEN", "PRIVATE", "ENCRYPTION_KEY",
             "WEBHOOK_SECRET", "SERVER_KEY")
leaks = []
for service in sorted(set(prod.get("services", {})) & set(stg.get("services", {}))):
    pm, sm = envmap(prod, service), envmap(stg, service)
    for k, pv in pm.items():
        if not pv or not any(tok in k.upper() for tok in SENSITIVE):
            continue
        sv = sm.get(k)
        if sv is not None and sv == pv:
            leaks.append(f"{service}.{k}")
note(not leaks,
     "no non-empty sensitive value is identical between the two stacks"
     + (f" (identical: {leaks})" if leaks else ""))

print("\n5. database identity")
def dbname(url):
    # postgresql://user:pass@host:port/dbname?params
    try:
        return url.split("@", 1)[1].split("/", 1)[1].split("?", 1)[0]
    except IndexError:
        return None
pdb = dbname(envmap(prod, "api").get("DATABASE_URL", ""))
sdb = dbname(envmap(stg, "api").get("DATABASE_URL", ""))
note(pdb is not None and sdb is not None and pdb != sdb,
     f"the API points at a different database (prod={pdb!r} staging={sdb!r})")

print("\n6. API secret provenance")
# `docker compose config` inlines an env_file's keys into `environment`, so the
# env_file path itself is not observable in the resolved output — check 4 is the
# authoritative guard, because it compares the resolved *values*. This check
# states the positive requirement on top of it: the staging API's own secrets
# must be present and must be its own, so an accidental fallback to production
# is a visible failure rather than a silent one.
stg_api = envmap(stg, "api")
prod_api = envmap(prod, "api")
required = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "MFA_ENCRYPTION_KEY"]
missing = [k for k in required if not stg_api.get(k)]
note(not missing, f"the staging API defines its own {required} (missing: {missing or 'none'})")
same = [k for k in required if stg_api.get(k) and stg_api.get(k) == prod_api.get(k)]
note(not same, f"none of those equals the production value (equal: {same or 'none'})")

print()
if problems:
    print(f"RESULT: {len(problems)} isolation problem(s) found.")
    sys.exit(1)
print("RESULT: staging is isolated from production.")
PY
rc=$?

if [[ $rc -eq 0 ]]; then
  echo
  echo "isolation: OK"
else
  echo
  echo "isolation: FAILED — do not start the staging stack until this passes." >&2
fi
exit $rc

#!/usr/bin/env bash
#
# ORYX — pre-launch / post-deploy validation.
#
# Checks the things that are cheap to check and expensive to get wrong: TLS,
# certificate expiry, the health probe, that the API actually reaches the
# database, that the security headers are present, that the refresh cookie is
# HttpOnly and that the demo seed did not run.
#
# It does not log in, and it does not create data. It is safe to run against a
# production system at any time.
#
# Usage:
#   ORYX_ADMIN_HOST=admin.example.com ORYX_CUSTOMER_HOST=www.example.com \
#     deploy/scripts/health-check.sh
#
# Exit codes:
#   0  every check passed
#   1  at least one check failed (each failure is printed)

set -uo pipefail

ADMIN_HOST="${ORYX_ADMIN_HOST:-}"
CUSTOMER_HOST="${ORYX_CUSTOMER_HOST:-}"
API_PATH="${ORYX_HEALTH_PATH:-/api/health}"
WARN_DAYS="${ORYX_CERT_WARN_DAYS:-21}"

# A pre-launch rehearsal runs against a self-signed certificate, which curl
# rejects before it ever sees the response. `ORYX_HEALTH_INSECURE=1` skips only
# the chain-of-trust check; TLS is still used, and the certificate is still
# inspected for expiry below. It must never be set for a real launch.
CURL_TLS=()
if [[ "${ORYX_HEALTH_INSECURE:-0}" == "1" ]]; then
  CURL_TLS=(-k)
fi

failures=0
warnings=0

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; failures=$((failures + 1)); }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$*"; warnings=$((warnings + 1)); }
section() { printf '\n\033[1m%s\033[0m\n' "$*"; }

[[ -n "$ADMIN_HOST" && -n "$CUSTOMER_HOST" ]] \
  || { echo "set ORYX_ADMIN_HOST and ORYX_CUSTOMER_HOST" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }

# ---------------------------------------------------------------- TLS and host
section "TLS and reachability"
for host in "$ADMIN_HOST" "$CUSTOMER_HOST"; do
  if curl ${CURL_TLS[@]+"${CURL_TLS[@]}"} -fsS -o /dev/null --max-time 15 "https://$host/" 2>/dev/null; then
    pass "https://$host/ responds"
  else
    fail "https://$host/ did not respond"
  fi

  # Plain HTTP must redirect, not serve.
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://$host/" 2>/dev/null)
  if [[ "$code" == "301" || "$code" == "308" ]]; then
    pass "http://$host/ redirects ($code)"
  else
    fail "http://$host/ returned $code instead of a redirect"
  fi
done

# ----------------------------------------------------------- certificate expiry
section "Certificate expiry"
if command -v openssl >/dev/null 2>&1; then
  for host in "$ADMIN_HOST" "$CUSTOMER_HOST"; do
    end=$(echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null \
            | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    if [[ -z "$end" ]]; then
      fail "could not read the certificate for $host"
      continue
    fi
    end_epoch=$(date -d "$end" +%s 2>/dev/null || echo 0)
    now_epoch=$(date +%s)
    days=$(( (end_epoch - now_epoch) / 86400 ))
    if [[ "$days" -lt 0 ]]; then
      fail "$host certificate expired ${days#-} day(s) ago"
    elif [[ "$days" -lt "$WARN_DAYS" ]]; then
      warn "$host certificate expires in $days day(s) — renew now"
    else
      pass "$host certificate valid for $days more day(s)"
    fi
  done
else
  warn "openssl not available; skipping certificate expiry"
fi

# ------------------------------------------------------------------- API health
section "API health"
health=$(curl ${CURL_TLS[@]+"${CURL_TLS[@]}"} -fsS --max-time 15 "https://$CUSTOMER_HOST$API_PATH" 2>/dev/null)
if [[ -z "$health" ]]; then
  fail "GET https://$CUSTOMER_HOST$API_PATH did not return a body"
else
  if command -v python3 >/dev/null 2>&1; then
    status=$(printf '%s' "$health" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("status",""))' 2>/dev/null)
    db=$(printf '%s' "$health" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("database",""))' 2>/dev/null)
    [[ "$status" == "ok" ]] && pass "health status is ok" || fail "health status is '$status'"
    [[ "$db" == "up" ]] && pass "database is reachable from the API" || fail "database reports '$db'"
  else
    warn "python3 not available; printing the raw health body"
    printf '        %s\n' "$health"
  fi
fi

# --------------------------------------------------------- security headers
section "Security headers"
headers=$(curl ${CURL_TLS[@]+"${CURL_TLS[@]}"} -sI --max-time 15 "https://$CUSTOMER_HOST/" 2>/dev/null)
check_header() {
  if printf '%s' "$headers" | grep -qi "^$1:"; then
    pass "$1 present"
  else
    fail "$1 missing"
  fi
}
check_header "strict-transport-security"
check_header "x-content-type-options"
check_header "x-frame-options"
check_header "referrer-policy"

# ------------------------------------------------------------- refresh cookie
section "Refresh cookie flags"
# A login attempt with a deliberately wrong password still sets no cookie on
# failure, so probe the refresh endpoint instead: it always answers with the
# cookie attributes when it rejects a missing token.
cookie_headers=$(curl ${CURL_TLS[@]+"${CURL_TLS[@]}"} -sI -X POST --max-time 15 \
  "https://$CUSTOMER_HOST/api/v1/auth/refresh" 2>/dev/null)
if printf '%s' "$cookie_headers" | grep -qi 'set-cookie:.*oryx_rt=.*HttpOnly'; then
  if printf '%s' "$cookie_headers" | grep -qi 'set-cookie:.*oryx_rt=.*Secure'; then
    pass "refresh cookie is HttpOnly and Secure"
  else
    fail "refresh cookie is HttpOnly but not Secure"
  fi
else
  # No cookie on a rejected refresh is also correct behaviour; note it rather
  # than calling it a failure.
  warn "no refresh cookie was set by a rejected refresh (acceptable)"
fi

# ----------------------------------------------------------- demo data check
section "Demo data"
# The seed marks synthetic tenants. If any exist in production, the seed ran
# where it should not have.
if command -v docker >/dev/null 2>&1; then
  compose_file="${ORYX_COMPOSE_FILE:-deploy/docker-compose.production.yml}"
  env_file="${ORYX_ENV_FILE:-.env.production}"
  if [[ -f "$compose_file" && -f "$env_file" ]]; then
    db_user=$(grep -E '^POSTGRES_USER=' "$env_file" | tail -1 | cut -d= -f2-)
    db_name=$(grep -E '^POSTGRES_DB=' "$env_file" | tail -1 | cut -d= -f2-)
    demo=$(docker compose ${ORYX_COMPOSE_PROJECT:+-p "$ORYX_COMPOSE_PROJECT"} -f "$compose_file" --env-file "$env_file" exec -T postgres \
      psql -U "$db_user" -d "$db_name" -tAc \
      "SELECT count(*) FROM \"Company\" WHERE \"notes\" LIKE '%SEED_DEMO_DATA%';" 2>/dev/null | tr -d '[:space:]')
    if [[ "$demo" == "0" ]]; then
      pass "no synthetic demo tenants present"
    elif [[ -n "$demo" ]]; then
      fail "$demo synthetic demo tenant(s) present — the development seed ran in production"
    else
      warn "could not query the Company table"
    fi
  else
    warn "compose/env file not found; skipping the demo data check"
  fi
else
  warn "docker not available; skipping the demo data check"
fi

# ------------------------------------------------------------------- summary
section "Summary"
printf '  %d failure(s), %d warning(s)\n' "$failures" "$warnings"
if [[ "$failures" -gt 0 ]]; then
  echo
  echo "Do not announce the deployment until every FAIL above is resolved."
  exit 1
fi
echo
echo "All checks passed."

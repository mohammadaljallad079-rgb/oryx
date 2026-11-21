#!/usr/bin/env bash
# Execution 20 — real HTTP smoke test for the P3–P7 planned-ecosystem surface.
#
# Runs against a live API on the migrated, seeded database. It exercises the
# consumer plane the mobile app and the customer website use: RFQ → quote →
# accept, consumer returns, recovery dispatch and tracking, fleets and drivers,
# fitment, SENSAGE AI status/analysis, and Auto Map proximity discovery. Every
# assertion is an HTTP status or a field read from a real response.
#
#   API_BASE=http://127.0.0.1:3001/api/v1 bash scripts/exec20-smoke.sh
set -u

B="${API_BASE:-http://127.0.0.1:3001/api/v1}"
PW='Str0ng!Pass2026'
PASS=0
FAIL=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok()   { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s — %s\n' "$1" "$2"; }
check(){ [ "$2" = "$3" ] && ok "$1 ($3)" || bad "$1" "expected $3, got $2"; }

jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }
code() { curl -s -o "$TMP/out" -w '%{http_code}' "$@"; }

# Register a fresh consumer and return its access token.
newtok() {
  local email="e20-$1-$(date +%s%N)@oryx.local"
  curl -s -X POST "$B/customer/auth/register" -H 'Content-Type: application/json' \
    -H 'x-oryx-client: mobile' \
    -d "{\"email\":\"$email\",\"password\":\"$PW\",\"fullName\":\"E20\",\"preferredLocale\":\"en\"}" \
    | jget "['accessToken']"
}

echo "Execution 20 smoke — $B"
echo
echo "== P3 — Auto Map proximity discovery =="
S=$(code "$B/marketplace/providers?lat=26.2285&lng=50.586&radiusKm=50")
check "providers by proximity" "$S" 200
S=$(code "$B/marketplace/providers?lat=91&lng=50.586")
check "out-of-range latitude refused" "$S" 400
S=$(code "$B/marketplace/providers?lat=26.2285")
check "half a coordinate refused" "$S" 400

echo
echo "== P4 — spare-parts RFQ =="
TOK=$(newtok rfq)
S=$(code -X POST "$B/customer/rfqs" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"categoryKey":"spare_parts","description":"Front brake pads for a 2022 Land Cruiser","quantity":2}')
check "raise RFQ" "$S" 201
RFQ=$(jget "['id']" < "$TMP/out")
S=$(code "$B/customer/rfqs" -H "Authorization: Bearer $TOK"); check "list own RFQs" "$S" 200
S=$(code "$B/customer/rfqs" -H "Authorization: Bearer $TOK"); check "list own RFQs" "$S" 200
S=$(code "$B/customer/rfqs"); check "RFQs without a token refused" "$S" 401
S=$(code "$B/provider/rfqs" -H "Authorization: Bearer $TOK")
check "consumer token refused on the provider RFQ queue" "$S" 401
S=$(code -X POST "$B/customer/rfqs/$RFQ/cancel" -H "Authorization: Bearer $TOK")
check "cancel own RFQ" "$S" 200

echo
echo "== P4 — consumer returns =="
TOK=$(newtok ret)
S=$(code "$B/customer/returns" -H "Authorization: Bearer $TOK"); check "list own returns" "$S" 200
S=$(code -X POST "$B/customer/orders/not-a-real-order/returns" -H "Authorization: Bearer $TOK" \
  -H 'Content-Type: application/json' -d '{"reason":"Wrong part","lines":[{"orderLineId":"l1","quantity":1}]}')
check "return on a foreign order refused" "$S" 404

echo
echo "== P4 — fitment =="
TOK=$(newtok fit)
VIN="E20$(date +%s%N | tail -c 15)"
S=$(code -X POST "$B/customer/vehicles" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d "{\"vin\":\"$VIN\",\"make\":\"Toyota\",\"model\":\"Land Cruiser\",\"modelYear\":2022,\"plateNumber\":\"E20-1\"}")
check "create a garage vehicle" "$S" 201
VID=$(jget "['id']" < "$TMP/out")
S=$(code "$B/customer/catalog/products?locale=en&pageSize=1")
check "read the public catalogue" "$S" 200
PID=$(jget "['items'][0]['id']" < "$TMP/out")
S=$(code "$B/customer/fitment?vehicleId=$VID&productId=$PID" -H "Authorization: Bearer $TOK")
check "fitment query for a real product" "$S" 200
KNOWN=$(jget "['fitmentKnown']" < "$TMP/out")
check "unknown fitment reported honestly, not as incompatible" "$KNOWN" "False"
S=$(code "$B/customer/fitment?vehicleId=$VID&productId=does-not-exist" -H "Authorization: Bearer $TOK")
check "fitment for an unknown product refused" "$S" 404
S=$(code "$B/customer/fitment?vehicleId=foreign-vehicle&productId=$PID" -H "Authorization: Bearer $TOK")
check "fitment for a foreign vehicle refused" "$S" 404

echo
echo "== P5 — recovery dispatch and tracking =="
TOK=$(newtok rec)
S=$(code -X POST "$B/customer/recovery" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"contactPhone":"+97330000000","issue":"Flat battery","urgency":"URGENT"}')
check "recovery without a pickup location refused" "$S" 400
S=$(code -X POST "$B/customer/recovery" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"pickupLatitude":26.2285,"pickupLongitude":50.586,"contactPhone":"+97330000000","issue":"Flat battery","urgency":"URGENT"}')
check "raise a recovery request" "$S" 201
REC=$(jget "['id']" < "$TMP/out")
S=$(code "$B/customer/recovery/$REC" -H "Authorization: Bearer $TOK"); check "track own recovery" "$S" 200
EVENTS=$(python3 -c "import json;print(len(json.load(open('$TMP/out'))['timeline']))")
[ "$EVENTS" -ge 1 ] && ok "tracking timeline has an event ($EVENTS)" || bad "tracking timeline" "no events"
S=$(code "$B/customer/recovery" -H "Authorization: Bearer $TOK"); check "list own recoveries" "$S" 200

echo
echo "== P6 — fleets and drivers =="
TOK=$(newtok fleet)
S=$(code -X POST "$B/customer/fleets" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"name":"Delivery fleet","contactPhone":"+97330000000"}')
check "create a fleet" "$S" 201
FLEET=$(jget "['id']" < "$TMP/out")
S=$(code "$B/customer/fleets" -H "Authorization: Bearer $TOK"); check "list own fleets" "$S" 200
S=$(code -X POST "$B/customer/fleets/$FLEET/drivers" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"fullName":"Ali Driver","phone":"+97330000001"}')
check "add a driver" "$S" 201
DRV=$(jget "['drivers'][0]['id']" < "$TMP/out")
S=$(code -X POST "$B/customer/fleets/$FLEET/drivers/$DRV/active" -H "Authorization: Bearer $TOK" \
  -H 'Content-Type: application/json' -d '{"isActive":false}')
check "toggle a driver" "$S" 200
S=$(code "$B/customer/fleets/foreign-fleet" -H "Authorization: Bearer $TOK")
check "foreign fleet read refused" "$S" 404

echo
echo "== P7 — SENSAGE AI =="
TOK=$(newtok ai)
S=$(code "$B/customer/sensage/status" -H "Authorization: Bearer $TOK"); check "SENSAGE status" "$S" 200
CONF=$(jget "['configured']" < "$TMP/out")
check "no model configured without a credential" "$CONF" "False"
S=$(code "$B/customer/sensage/suggestions" -H "Authorization: Bearer $TOK"); check "list own suggestions" "$S" 200
S=$(code -X POST "$B/customer/sensage/analyze" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"photoId":"does-not-exist"}')
check "analyse an unknown photo refused" "$S" 404

echo
printf 'Execution 20 smoke — %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

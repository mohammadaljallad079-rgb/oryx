#!/usr/bin/env bash
# Execution 10 — real HTTP smoke test for the mobile integration.
#
# Runs against a live API on the seeded database. It exercises the paths the
# mobile app uses: customer auth, the vehicle garage, the booking engine,
# product media upload and the provider portal. Every assertion is an HTTP
# status or a field read from a real response.
#
#   API_BASE=http://127.0.0.1:3001/api/v1 bash scripts/exec10-smoke.sh
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
newtok() {
  local email="e10-$1-$(date +%s%N)@oryx.local"
  curl -s -X POST "$B/customer/auth/register" -H 'Content-Type: application/json' \
    -H 'x-oryx-client: mobile' \
    -d "{\"email\":\"$email\",\"password\":\"$PW\",\"fullName\":\"E10\",\"preferredLocale\":\"en\"}" \
    | jget "['accessToken']"
}

echo "Execution 10 smoke — $B"
echo
echo "== customer authentication =="
EMAIL="e10-auth-$(date +%s%N)@oryx.local"
S=$(code -X POST "$B/customer/auth/register" -H 'Content-Type: application/json' -H 'x-oryx-client: mobile' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\",\"fullName\":\"Auth\",\"preferredLocale\":\"en\"}")
check "register" "$S" 201
TOK=$(jget "['accessToken']" < "$TMP/out")
S=$(code "$B/customer/auth/me" -H "Authorization: Bearer $TOK"); check "me" "$S" 200
S=$(code "$B/customer/auth/me"); check "me without token refused" "$S" 401
S=$(code -X POST "$B/customer/auth/login" -H 'Content-Type: application/json' -H 'x-oryx-client: mobile' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}"); check "login" "$S" 200
S=$(code -X POST "$B/customer/auth/login" -H 'Content-Type: application/json' -H 'x-oryx-client: mobile' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrong-password\"}"); check "login with wrong password refused" "$S" 401
S=$(code -X POST "$B/customer/auth/refresh" -H 'Content-Type: application/json' -H 'x-oryx-client: mobile' \
  -d "{\"refreshToken\":\"not-a-real-token\"}"); check "refresh with a bad token refused" "$S" 401
S=$(code -X POST "$B/customer/auth/logout" -H "Authorization: Bearer $TOK"); check "logout" "$S" 204

echo
echo "== vehicle garage =="
TOK=$(newtok veh)
VIN="E10$(date +%s%N | tail -c 15)"
S=$(code -X POST "$B/customer/vehicles" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d "{\"vin\":\"$VIN\",\"make\":\"Toyota\",\"model\":\"Land Cruiser\",\"modelYear\":2022,\"plateNumber\":\"E10-1\"}")
check "create vehicle" "$S" 201
VID=$(jget "['id']" < "$TMP/out")
S=$(code "$B/customer/vehicles" -H "Authorization: Bearer $TOK"); check "list garage" "$S" 200
HAS=$(python3 -c "import json;d=json.load(open('$TMP/out'));print(any(v['id']=='$VID' for v in (d if isinstance(d,list) else d.get('items',[]))))")
check "new vehicle in the garage" "$HAS" True
S=$(code "$B/customer/vehicles/$VID/history" -H "Authorization: Bearer $TOK"); check "vehicle history" "$S" 200
TOK2=$(newtok veh2)
S=$(code "$B/customer/vehicles/$VID" -H "Authorization: Bearer $TOK2"); check "foreign vehicle refused" "$S" 404

echo
echo "== bookings =="
D=$(date -u -d '+2 days' +%Y-%m-%d)
S=$(code "$B/customer/bookings/availability?date=$D&durationMinutes=60" -H "Authorization: Bearer $TOK")
check "availability" "$S" 200
SLOT=$(jget "[0]['startsAt']" < "$TMP/out")
if [ -z "$SLOT" ] || [ "$SLOT" = "None" ]; then bad "availability returned a slot" "no slot offered"; else ok "availability returned a slot"; fi
S=$(code -X POST "$B/customer/bookings" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d "{\"bookingType\":\"PROVIDER_SERVICE\",\"startsAt\":\"$SLOT\",\"durationMinutes\":60}")
check "create booking" "$S" 201
BID=$(jget "['id']" < "$TMP/out")
S=$(code -X POST "$B/customer/bookings/$BID/confirm" -H "Authorization: Bearer $TOK"); check "confirm booking" "$S" 200
S=$(code "$B/customer/bookings/$BID" -H "Authorization: Bearer $TOK"); check "booking detail" "$S" 200
S=$(code "$B/customer/bookings/$BID" -H "Authorization: Bearer $TOK2"); check "foreign booking refused" "$S" 404
S=$(code -X POST "$B/customer/bookings/$BID/cancel" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"reason":"smoke"}')
check "cancel booking" "$S" 200

echo
echo "== consumer order plane =="
S=$(code "$B/customer/orders" -H "Authorization: Bearer $TOK"); check "order history" "$S" 200
S=$(code "$B/customer/cart" -H "Authorization: Bearer $TOK"); check "cart" "$S" 200
S=$(code "$B/customer/favorites" -H "Authorization: Bearer $TOK"); check "favorites" "$S" 200
S=$(code "$B/customer/homepage"); check "public homepage" "$S" 200
S=$(code "$B/customer/catalog/products"); check "public catalogue" "$S" 200

echo
echo "== media upload (real PNG through the sharp pipeline) =="
# A real 80x80 RGB PNG, so the media service's re-encode has something to
# work with; a 1x1 pixel is refused by the image pipeline.
python3 - "$TMP/pixel.png" <<'PYEOF'
import sys, zlib, struct
w = h = 80
raw = b''.join(b'\x00' + bytes([40, 90, 160] * w) for _ in range(h))
def chunk(tag, data):
    body = tag + data
    return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n'
png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(raw, 9))
png += chunk(b'IEND', b'')
open(sys.argv[1], 'wb').write(png)
PYEOF
S=$(code -X POST "$B/customer/inspection-photos" -H "Authorization: Bearer $TOK" -F "file=@$TMP/pixel.png;type=image/png" -F "caption=smoke")
check "upload a real image" "$S" 201
URL=$(jget "['url']" < "$TMP/out")
S=$(code "$B${URL#/api/v1}"); check "serve the stored bytes" "$S" 200
S=$(code "$B/customer/inspection-photos" -H "Authorization: Bearer $TOK"); check "upload history" "$S" 200
# Real non-image bytes: the service sniffs magic bytes and must refuse this
# whatever content-type the client claims.
printf 'not an image at all' > "$TMP/notimage.bin"
S=$(code -X POST "$B/customer/inspection-photos" -H "Authorization: Bearer $TOK" -F "file=@$TMP/notimage.bin;type=image/png")
check "non-image refused despite a lying content-type" "$S" 400
S=$(code -X POST "$B/customer/inspection-photos" -F "file=@$TMP/pixel.png;type=image/png")
check "unauthenticated upload refused" "$S" 401
echo
echo "== provider portal isolation =="
S=$(code "$B/provider/profile"); check "provider portal without a token refused" "$S" 401
S=$(code "$B/provider/requests" -H "Authorization: Bearer $TOK"); check "consumer token on the provider portal refused" "$S" 401

echo
printf '\033[1m%d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

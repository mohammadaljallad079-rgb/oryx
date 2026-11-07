#!/usr/bin/env bash
# Execution 11 — real HTTP smoke test for the consumer order layer.
# Runs against the live API on 127.0.0.1:3001 with the seeded dev database.
set -u
B=http://127.0.0.1:3001/api/v1
EMAIL="exec11-smoke-$(date +%s)@oryx.local"
PW='Str0ng!Pass2026'

jq_get() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)"; }

echo "== register =="
REG=$(curl -s -X POST "$B/customer/auth/register" -H 'Content-Type: application/json' -H 'x-oryx-client: mobile' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\",\"fullName\":\"Exec Eleven\",\"preferredLocale\":\"en\"}")
TOK=$(echo "$REG" | jq_get "['accessToken']")
echo "accessToken length: ${#TOK}"

echo "== login =="
LOGIN=$(curl -s -X POST "$B/customer/auth/login" -H 'Content-Type: application/json' -H 'x-oryx-client: mobile' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}")
TOK=$(echo "$LOGIN" | jq_get "['accessToken']")
echo "login ok, token length: ${#TOK}"

PID=$(curl -s "$B/customer/catalog/products?locale=en&pageSize=1" | jq_get "['items'][0]['id']")
echo "product id: $PID"

echo "== add 2 to cart =="
curl -s -X POST "$B/customer/cart/items" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PID\",\"quantity\":2}" | head -c 300
echo

echo "== cart =="
curl -s "$B/customer/cart" -H "Authorization: Bearer $TOK" | head -c 500
echo

echo "== place order =="
KEY="exec11-$(date +%s)"
ORDER=$(curl -s -X POST "$B/customer/orders" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d "{\"paymentMethod\":\"CASH\",\"idempotencyKey\":\"$KEY\"}")
echo "$ORDER" | head -c 800
echo
OID=$(echo "$ORDER" | jq_get "['id']")
echo "order id: $OID"

echo "== idempotent replay (same key) =="
REPLAY=$(curl -s -X POST "$B/customer/orders" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d "{\"paymentMethod\":\"CASH\",\"idempotencyKey\":\"$KEY\"}")
RID=$(echo "$REPLAY" | jq_get "['id']")
echo "replay order id: $RID  (same as $OID: $([ "$OID" = "$RID" ] && echo YES || echo NO))"

echo "== cart emptied after placement =="
curl -s "$B/customer/cart" -H "Authorization: Bearer $TOK" | head -c 200
echo

echo "== order list =="
curl -s "$B/customer/orders?page=1&pageSize=5" -H "Authorization: Bearer $TOK" | head -c 400
echo

echo "== order detail =="
curl -s "$B/customer/orders/$OID" -H "Authorization: Bearer $TOK" | head -c 600
echo

echo "== cancel order =="
curl -s -X POST "$B/customer/orders/$OID/cancel" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"reason":"smoke test"}' | head -c 400
echo

echo "== second cancel must be 409 =="
curl -s -o /tmp/exec11.cancel2.json -w '%{http_code}\n' -X POST "$B/customer/orders/$OID/cancel" \
  -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"reason":"again"}'
cat /tmp/exec11.cancel2.json | head -c 200
echo

echo "== cross-account read must be 404 =="
EMAIL2="exec11-other-$(date +%s)@oryx.local"
TOK2=$(curl -s -X POST "$B/customer/auth/register" -H 'Content-Type: application/json' -H 'x-oryx-client: mobile' \
  -d "{\"email\":\"$EMAIL2\",\"password\":\"$PW\",\"fullName\":\"Other\",\"preferredLocale\":\"en\"}" | jq_get "['accessToken']")
curl -s -o /tmp/exec11.cross.json -w '%{http_code}\n' "$B/customer/orders/$OID" -H "Authorization: Bearer $TOK2"
cat /tmp/exec11.cross.json | head -c 200
echo

echo "== guest order list must be 401 =="
curl -s -o /dev/null -w '%{http_code}\n' "$B/customer/orders"

echo "== staff token must be refused on a customer route =="
STOK=$(curl -s -X POST "$B/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@oryx-auto.local","password":"ChangeMe!Oryx2026"}' | jq_get "['accessToken']")
curl -s -o /dev/null -w '%{http_code}\n' "$B/customer/orders" -H "Authorization: Bearer $STOK"

echo "SMOKE DONE"

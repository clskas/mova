#!/usr/bin/env bash
# End-to-end passenger journey against PRE-PRODUCTION (mocked OTP / SMS / payments).
# Run by deploy.yml after the staging smoke, before production is touched.
#
#   GATEWAY_URL=https://mova-stg-gateway.onrender.com bash scripts/staging-journey.sh
#
# Never point it at production: it signs in with the mock OTP and creates a ride.
set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:?GATEWAY_URL required}"
GATEWAY_URL="${GATEWAY_URL%/}"
GATEWAY_URL="${GATEWAY_URL%/api}"
API="$GATEWAY_URL/api"
PHONE="${JOURNEY_PHONE:-+243900000098}"
case "$GATEWAY_URL" in
  *mova-stg-*|*localhost*|*127.0.0.1*) ;;
  *) echo "Refusing to run the staging journey against $GATEWAY_URL" >&2; exit 2 ;;
esac

step() { echo "=== $* ==="; }
fail() { echo "JOURNEY FAILED: $*" >&2; exit 1; }
# call METHOD PATH [JSON] → body on stdout; fails on non-2xx.
call() {
  local method="$1" path="$2" data="${3:-}" out code
  out=$(mktemp)
  code=$(curl -s -o "$out" -w '%{http_code}' -X "$method" "$API$path" \
    -H 'Content-Type: application/json' -H 'X-Senga-Client: senga' \
    ${TOKEN:+-H "Authorization: Bearer $TOKEN"} ${data:+-d "$data"} --max-time 60)
  if [[ "$code" != 2* ]]; then
    echo "$method $path → HTTP $code: $(head -c 400 "$out")" >&2
    rm -f "$out"
    return 1
  fi
  cat "$out"
  rm -f "$out"
}
field() { jq -r "$1 // empty"; }

TOKEN=""
step "Sign in (mock OTP) as $PHONE"
call POST /auth/otp/request "{\"phone\":\"$PHONE\"}" >/dev/null || fail "OTP request"
TOKEN=$(call POST /auth/otp/verify "{\"phone\":\"$PHONE\",\"code\":\"123456\"}" | field '.accessToken // .data.accessToken') \
  || fail "OTP verify"
[ -n "$TOKEN" ] || fail "no accessToken returned"

step "Profile"
call GET /users/me | field '.id // .data.id' | grep -q . || fail "GET /users/me"

step "Estimate"
TRIP='{"pickupLat":-4.3217,"pickupLng":15.3125,"dropoffLat":-4.35,"dropoffLng":15.34,"vehicleType":"STANDARD","pickupAddress":"Gombe","dropoffAddress":"Limete"}'
call POST /rides/estimate "$TRIP" | jq -e 'tostring | length > 2' >/dev/null || fail "estimate"

step "Cancel any ride left by a previous run"
active=$(call GET /rides/active | field '.id // .ride.id // .data.id' || true)
[ -n "$active" ] && call POST "/rides/$active/cancel" '{"reason":"staging journey cleanup"}' >/dev/null || true

step "Create ride"
RIDE=$(call POST /rides "$TRIP" | field '.id // .ride.id // .data.id') || fail "create ride"
[ -n "$RIDE" ] || fail "no ride id"
echo "ride $RIDE"

step "Read ride back"
call GET "/rides/$RIDE" | field '.id // .ride.id // .data.id' | grep -q "$RIDE" || fail "GET /rides/$RIDE"

step "Cancel ride"
call POST "/rides/$RIDE/cancel" '{"reason":"staging journey"}' >/dev/null || fail "cancel ride"

step "Wallet (payment-service)"
call GET /wallet >/dev/null || fail "GET /wallet"

step "Notifications (notification-service)"
call GET /notifications >/dev/null || fail "GET /notifications"

step "History"
call GET /rides/history >/dev/null || fail "GET /rides/history"

echo "=== JOURNEY PASSED ==="

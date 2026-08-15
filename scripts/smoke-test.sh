#!/usr/bin/env bash
# Smoke test MOVA gateway + optional direct services (production or local).
set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-${API_URL:-${SMOKE_API_URL:-http://localhost:3000}}}"
GATEWAY_URL="${GATEWAY_URL%/}"
GATEWAY_URL="${GATEWAY_URL%/api}"
REQUEST_ID="${SMOKE_REQUEST_ID:-smoke-$(date +%Y%m%d%H%M%S)}"
HEADERS=(-H "X-Request-Id: $REQUEST_ID")
FAIL=0

log() { echo "$@"; }
fail() { echo "FAIL: $*" >&2; FAIL=1; }

echo "=== Gateway health ($GATEWAY_URL) ==="
if ! health=$(curl -sf "${HEADERS[@]}" "${GATEWAY_URL}/health"); then
  fail "Gateway unreachable at $GATEWAY_URL/health"
  exit 1
fi
echo "$health" | head -c 500
echo ""

rid=$(curl -sI "${HEADERS[@]}" "${GATEWAY_URL}/health" | awk -F': ' 'tolower($1)=="x-request-id"{print $2}' | tr -d '\r')
if [ -n "$rid" ]; then
  echo "X-Request-Id: $rid"
else
  echo "WARN: X-Request-Id absent on /health"
fi

if [ "${SMOKE_DIRECT_SERVICES:-}" = "true" ]; then
  declare -A PORTS=( [auth]=3011 [ride]=3022 [payment]=3003 [driver]=3004 [notification]=3005 [admin]=3006 )
  for svc in "${!PORTS[@]}"; do
    port="${PORTS[$svc]}"
    direct="http://localhost:${port}/health"
    echo "=== ${svc} direct ${direct} ==="
    curl -sf "$direct" -o /dev/null && echo "OK" || echo "SKIP (not running)"
  done
fi

echo "=== Public app-version (no auth) ==="
if appver=$(curl -sf "${HEADERS[@]}" "${GATEWAY_URL}/api/public/app-version"); then
  echo "$appver" | head -c 300
  echo ""
  echo "$appver" | grep -q '"passenger"' && echo "$appver" | grep -q '"driver"' \
    || fail "GET /api/public/app-version missing passenger/driver blocks"
else
  fail "GET /api/public/app-version failed (must stay public)"
fi

echo "=== Geo communes (via gateway) ==="
if curl -sf "${HEADERS[@]}" "${GATEWAY_URL}/api/geo/communes?city=Kinshasa" | head -c 200; then
  echo ""
else
  echo "WARN: GET /api/geo/communes failed (ride-service may still be starting)"
fi

echo "=== Ride estimate ==="
estimate_body='{"pickupLat":-4.3217,"pickupLng":15.3125,"dropoffLat":-4.35,"dropoffLng":15.34,"vehicleType":"STANDARD"}'
if curl -sf -X POST "${HEADERS[@]}" "${GATEWAY_URL}/api/rides/estimate" \
  -H 'Content-Type: application/json' \
  -d "$estimate_body" | head -c 300; then
  echo ""
else
  echo "WARN: estimate failed (seed rides may be required)"
fi

echo "=== OTP request (mock or Twilio) ==="
if curl -sf -X POST "${GATEWAY_URL}/api/auth/otp/request" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+243812345678"}' | head -c 200; then
  echo ""
else
  echo "WARN: OTP request failed"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "=== SMOKE FAILED ===" >&2
  exit 1
fi

echo "=== SMOKE PASSED ==="

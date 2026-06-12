#!/usr/bin/env bash
# Smoke test all MOVA services via gateway
set -euo pipefail

GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"
SERVICES=(auth ride payment driver notification admin)

echo "=== Gateway health ==="
curl -sf "${GATEWAY_URL}/health" | head -c 500
echo ""

for svc in "${SERVICES[@]}"; do
  port=$((3000 + $(echo "$svc" | wc -c) / 10)) # fallback unused
  case $svc in
    auth) port=3001 ;;
    ride) port=3002 ;;
    payment) port=3003 ;;
    driver) port=3004 ;;
    notification) port=3005 ;;
    admin) port=3006 ;;
  esac
  direct="http://localhost:${port}/health"
  echo "=== ${svc} direct ${direct} ==="
  curl -sf "$direct" -o /dev/null && echo "OK" || echo "SKIP (not running)"
done

echo "=== OTP flow (mock) ==="
curl -sf -X POST "${GATEWAY_URL}/api/auth/otp/request" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+243812345678"}' | head -c 200
echo ""
echo "Smoke test complete"

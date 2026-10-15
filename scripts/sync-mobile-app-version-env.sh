#!/usr/bin/env bash
# After a successful Play / TestFlight ship, advertise the new store build on
# ride-service so in-app update banners stay accurate. Stale MOBILE_* env
# (e.g. 1.0.27+139) hid banners for anyone already at/above the code floor.
#
# Usage:
#   VERSION_NAME=1.0.32 VERSION_CODE=157 ./scripts/sync-mobile-app-version-env.sh
#   # or:
#   ./scripts/sync-mobile-app-version-env.sh 1.0.32 157
set -euo pipefail

NAME="${VERSION_NAME:-${1:-}}"
CODE="${VERSION_CODE:-${2:-}}"
if [[ -z "$NAME" || -z "$CODE" ]]; then
  echo "Usage: VERSION_NAME=x.y.z VERSION_CODE=N $0" >&2
  exit 1
fi
if [[ ! "$CODE" =~ ^[0-9]+$ ]]; then
  echo "VERSION_CODE must be an integer, got: $CODE" >&2
  exit 1
fi
if [[ -z "${RENDER_API_KEY:-}" ]]; then
  echo "::warning::RENDER_API_KEY unset — skip MOBILE_* env sync"
  exit 0
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RIDE_ID="$(python -c "import json; print(json.load(open(r'$ROOT/config/render-services.json'))['services']['mova-ride']['id'])")"

put_env() {
  local key="$1" value="$2"
  local url="https://api.render.com/v1/services/${RIDE_ID}/env-vars/$(python -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$key")"
  local code
  code=$(curl -sS -o /tmp/mova-mobile-env.json -w "%{http_code}" -X PUT "$url" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$(python -c "import json,sys; print(json.dumps({'value': sys.argv[1]}))" "$value")")
  if [[ "$code" == "404" ]]; then
    code=$(curl -sS -o /tmp/mova-mobile-env.json -w "%{http_code}" -X POST \
      "https://api.render.com/v1/services/${RIDE_ID}/env-vars" \
      -H "Authorization: Bearer ${RENDER_API_KEY}" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -d "$(python -c "import json,sys; print(json.dumps({'key': sys.argv[1], 'value': sys.argv[2]}))" "$key" "$value")")
  fi
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    echo "::error::Failed to set $key (HTTP $code)"
    cat /tmp/mova-mobile-env.json || true
    exit 1
  fi
  echo "Set $key=$value"
}

put_env MOBILE_PASSENGER_VERSION "$NAME"
put_env MOBILE_DRIVER_VERSION "$NAME"
put_env MOBILE_PASSENGER_VERSION_CODE "$CODE"
put_env MOBILE_DRIVER_VERSION_CODE "$CODE"

# Env changes apply on next deploy/restart — trigger ride-service.
DEPLOY_CODE=$(curl -sS -o /tmp/mova-ride-deploy.json -w "%{http_code}" -X POST \
  "https://api.render.com/v1/services/${RIDE_ID}/deploys" \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{}')
if [[ "$DEPLOY_CODE" != "200" && "$DEPLOY_CODE" != "201" ]]; then
  echo "::warning::ride-service redeploy HTTP $DEPLOY_CODE (env updated; restart manually if needed)"
  cat /tmp/mova-ride-deploy.json || true
else
  echo "Triggered ride-service redeploy so app-version picks up $NAME+$CODE"
fi

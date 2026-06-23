#!/usr/bin/env bash
# Trigger Render deploys for all MOVA services (API). Used by deploy.yml after CI on main.
set -euo pipefail

if [ -z "${RENDER_API_KEY:-}" ]; then
  echo "::warning::RENDER_API_KEY not set — skip remote deploy"
  exit 0
fi

COMMIT_SHA="${1:-}"
IDS="${RENDER_SERVICE_IDS:-}"

if [ -z "$IDS" ] && [ -f config/render-services.json ]; then
  IDS=$(jq -r '
    [
      .services["mova-auth"].id,
      .services["mova-ride"].id,
      .services["mova-payment"].id,
      .services["mova-driver"].id,
      .services["mova-notification"].id,
      .services["mova-admin"].id,
      .services["mova-gateway"].id,
      .services["mova-web"].id
    ] | join(" ")
  ' config/render-services.json)
fi

if [ -z "$IDS" ]; then
  echo "::warning::RENDER_SERVICE_IDS not set — skip remote deploy"
  exit 0
fi

payload='{"clearCache":"do_not_clear"}'
if [ -n "$COMMIT_SHA" ]; then
  payload=$(jq -n --arg sha "$COMMIT_SHA" '{clearCache: "do_not_clear", commitId: $sha}')
fi

failed=0
for id in $IDS; do
  echo "Deploying Render service $id (commit: ${COMMIT_SHA:-latest})"
  response=$(mktemp)
  http_code=$(curl -sS -w "%{http_code}" -o "$response" -X POST \
    "https://api.render.com/v1/services/${id}/deploys" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$payload") || true

  if [ "$http_code" = "201" ] || [ "$http_code" = "202" ]; then
    echo "  OK ($http_code)"
  elif [ "$http_code" = "409" ]; then
    echo "  Skipped ($http_code) — deploy already in progress"
  else
    echo "::warning::Deploy failed for $id (HTTP $http_code): $(cat "$response")"
    failed=$((failed + 1))
  fi
  rm -f "$response"
  sleep 2
done

if [ "$failed" -gt 0 ]; then
  echo "::error::$failed Render service(s) could not be triggered"
  exit 1
fi

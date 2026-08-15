#!/usr/bin/env bash
# Trigger Render deploys for all MOVA services (API). Used by deploy.yml after CI on main.
set -euo pipefail

if [ -z "${RENDER_API_KEY:-}" ]; then
  echo "::warning::RENDER_API_KEY not set — skip remote deploy"
  exit 0
fi

COMMIT_SHA="${1:-}"
IDS="${RENDER_SERVICE_IDS:-}"

if [ -f config/render-services.json ]; then
  # Always prefer the in-repo map so restaurant / rental / admin-web cannot be dropped
  # when the GitHub secret still lists only the original 8 services.
  JSON_IDS=$(jq -r '
    [
      .services["mova-auth"].id // empty,
      .services["mova-ride"].id // empty,
      .services["mova-payment"].id // empty,
      .services["mova-driver"].id // empty,
      .services["mova-notification"].id // empty,
      .services["mova-admin"].id // empty,
      .services["mova-gateway"].id // empty,
      .services["mova-web"].id // empty,
      .services["mova-admin-web"].id // empty,
      .services["mova-restaurant"].id // empty,
      .services["mova-rental-partner"].id // empty
    ] | map(select(length > 0)) | join(" ")
  ' config/render-services.json)
  if [ -n "$JSON_IDS" ]; then
    IDS="$JSON_IDS"
  fi
fi

if [ -z "$IDS" ]; then
  echo "::warning::RENDER_SERVICE_IDS not set — skip remote deploy"
  exit 0
fi

if [ -f config/render-services.json ]; then
  restaurant_id=$(jq -r '.services["mova-restaurant"].id // empty' config/render-services.json)
  rental_id=$(jq -r '.services["mova-rental-partner"].id // empty' config/render-services.json)
  admin_web_id=$(jq -r '.services["mova-admin-web"].id // empty' config/render-services.json)
  missing=""
  for required in "$restaurant_id" "$rental_id" "$admin_web_id"; do
    if [ -n "$required" ] && ! printf ' %s ' "$IDS" | grep -q " $required "; then
      missing="$missing $required"
    fi
  done
  if [ -n "$missing" ]; then
    echo "::error::Portal service IDs missing from deploy list:$missing"
    echo "Restaurant/rental/admin-web would stay on stale images."
    exit 1
  fi
  echo "Deploy list includes restaurant=$restaurant_id rental=$rental_id admin-web=$admin_web_id"
fi

payload_latest='{"clearCache":"clear"}'
payload="$payload_latest"
if [ -n "$COMMIT_SHA" ]; then
  payload=$(jq -n --arg sha "$COMMIT_SHA" '{clearCache: "clear", commitId: $sha}')
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

  # If Render's linked Git repo doesn't contain this SHA (wrong fork/remote),
  # fall back to deploying the connected branch tip.
  if [ "$http_code" = "404" ] && [ -n "$COMMIT_SHA" ]; then
    echo "  Commit not on linked repo — retrying without commitId (branch tip)"
    http_code=$(curl -sS -w "%{http_code}" -o "$response" -X POST \
      "https://api.render.com/v1/services/${id}/deploys" \
      -H "Authorization: Bearer ${RENDER_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$payload_latest") || true
  fi

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

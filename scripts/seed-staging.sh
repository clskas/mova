#!/usr/bin/env bash
# Fill PRE-PRODUCTION (mova-stg-*) with realistic fake data: 15 passengers, 15 drivers
# (8 KYC-approved and available in Kinshasa, with vehicles), past rides, incidents.
# Idempotent (upserts). Test phones +2439000000xx, OTP 123456 (mocked SMS on staging).
#
# Production is protected three ways:
#   1. the database comes only from config/render-services.staging.json (postgresId);
#   2. that id must not be the production Postgres;
#   3. the connection string host must contain the staging id.
#
# Usage: RENDER_API_KEY=… bash scripts/seed-staging.sh
set -euo pipefail

: "${RENDER_API_KEY:?RENDER_API_KEY required}"
CFG=config/render-services.staging.json
PROD_PG_ID="dpg-daa5u3on74is739uken0"
API=https://api.render.com/v1

[ -f "$CFG" ] || { echo "::error::$CFG missing — staging not provisioned."; exit 1; }
PG_ID=$(jq -r '.postgresId // empty' "$CFG")
GW_ID=$(jq -r '.gatewayServiceId // empty' "$CFG")
AUTH_URL=$(jq -r '.services["mova-auth"].url // empty' "$CFG")
[ -n "$PG_ID" ] && [ -n "$GW_ID" ] && [ -n "$AUTH_URL" ] || { echo "::error::$CFG incomplete."; exit 1; }

case "$PG_ID" in
  "$PROD_PG_ID"*) echo "::error::REFUSED: $PG_ID is the PRODUCTION database."; exit 1 ;;
esac
case "$AUTH_URL" in
  *mova-stg-*) ;;
  *) echo "::error::REFUSED: auth URL $AUTH_URL is not a staging service."; exit 1 ;;
esac

render() { curl -sf -H "Authorization: Bearer $RENDER_API_KEY" "$API$1"; }

PG_URL=$(render "/postgres/$PG_ID/connection-info" | jq -r '.externalConnectionString // empty')
[ -n "$PG_URL" ] || { echo "::error::No external connection string for $PG_ID."; exit 1; }
case "$PG_URL" in
  *"$PG_ID"*) ;;
  *) echo "::error::REFUSED: connection host does not match staging $PG_ID."; exit 1 ;;
esac
case "$PG_URL" in
  *"$PROD_PG_ID"*) echo "::error::REFUSED: connection string points at PRODUCTION."; exit 1 ;;
esac
echo "::add-mask::$PG_URL"

INTERNAL_API_KEY=$(render "/services/$GW_ID/env-vars?limit=100" \
  | jq -r '[.[] | (.envVar // .) | select(.key == "INTERNAL_API_KEY") | .value][0] // empty')
[ -n "$INTERNAL_API_KEY" ] || { echo "::error::INTERNAL_API_KEY not found on staging gateway."; exit 1; }
echo "::add-mask::$INTERNAL_API_KEY"

with_schema() {
  node -e 'const u = new URL(process.argv[1]); u.searchParams.set("schema", process.argv[2]); process.stdout.write(u.toString())' "$PG_URL" "$1"
}

# Explicit local-style env so isFakeUserSeedAllowed() lets the demo seeds run here
# (never set on Render: the services themselves keep RUN_SEED=false, APP_ENV=staging).
export APP_ENV=development NODE_ENV=development RUN_SEED=true
export AUTH_SERVICE_URL="$AUTH_URL" INTERNAL_API_KEY

run_seed() {
  local svc="$1" schema="$2"
  echo "=== seed $svc (schema $schema) ==="
  # npm workspaces hoist one shared @prisma/client: regenerate it for THIS service
  # right before its seed, or it carries another service's models (UserRole undefined).
  ( cd "services/$svc" && npx prisma generate >/dev/null \
      && DATABASE_URL="$(with_schema "$schema")" npx --yes tsx prisma/seed-demo.ts )
}

run_seed auth-service auth
run_seed driver-service drivers
run_seed ride-service rides

echo "Staging seeded. Check: $AUTH_URL is reachable; drivers +243900000023/24/25/27/29/50/52/54 are approved."

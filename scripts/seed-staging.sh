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

# The staging DB accepts no outside connection (empty IP allow list). Open it to this
# machine's IP only for the duration of the seed, and always restore it on exit.
ORIG_ALLOW=$(render "/postgres/$PG_ID" | jq -c '.ipAllowList // []')
MY_IP=$(curl -sf -m 10 https://api.ipify.org)
[ -n "$MY_IP" ] || { echo "::error::Cannot read this runner's public IP."; exit 1; }
set_allow() {
  curl -sf -o /dev/null -X PATCH "$API/postgres/$PG_ID" \
    -H "Authorization: Bearer $RENDER_API_KEY" -H 'Content-Type: application/json' \
    -d "$(jq -n --argjson l "$1" '{ipAllowList: $l}')"
}
restore_allow() {
  if set_allow "$ORIG_ALLOW"; then echo "Staging DB allow list restored: $ORIG_ALLOW"
  else echo "::error::Could not restore the staging DB allow list — reset it to $ORIG_ALLOW in Render."; fi
}
trap restore_allow EXIT
set_allow "$(jq -c --arg ip "$MY_IP/32" '. + [{cidrBlock: $ip, description: "seed-staging (temporary)"}]' <<<"$ORIG_ALLOW")"
echo "Staging DB temporarily open to $MY_IP/32"
for i in $(seq 1 12); do
  node -e 'const n=require("net"),u=new URL(process.argv[1]);const s=n.connect(+(u.port||5432),u.hostname,()=>{s.end();process.exit(0)});s.on("error",()=>process.exit(1));setTimeout(()=>process.exit(1),5000)' "$PG_URL" && break
  sleep 5
done
sleep 15  # allow-list propagation

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
  ( cd "services/$svc" && npx prisma generate >/dev/null ) || return 1
  local url; url="$(with_schema "$schema")"
  for attempt in 1 2 3 4; do  # idempotent: retries cover allow-list propagation
    ( cd "services/$svc" && DATABASE_URL="$url" npx --yes tsx prisma/seed-demo.ts ) && return 0
    echo "seed $svc attempt $attempt failed — retry in 20s"; sleep 20
  done
  return 1
}

run_seed auth-service auth
run_seed driver-service drivers
run_seed ride-service rides

echo "Staging seeded. Check: $AUTH_URL is reachable; drivers +243900000023/24/25/27/29/50/52/54 are approved."

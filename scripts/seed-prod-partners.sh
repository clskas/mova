#!/usr/bin/env bash
# Seed partner + admin accounts on auth DB, then link restaurant/vehicle on rides DB.
# Env: AUTH_DATABASE_URL or DATABASE_URL_AUTH, RIDE_DATABASE_URL or DATABASE_URL_RIDES
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUTH="${AUTH_DATABASE_URL:-${DATABASE_URL_AUTH:-}}"
RIDES="${RIDE_DATABASE_URL:-${DATABASE_URL_RIDES:-}}"
if [[ -z "$AUTH" || -z "$RIDES" ]]; then
  echo "AUTH_DATABASE_URL (or DATABASE_URL_AUTH) and RIDE_DATABASE_URL (or DATABASE_URL_RIDES) are required" >&2
  exit 1
fi

echo "Seeding auth users (admin + restaurant + rental partner)..."
psql "$AUTH" -v ON_ERROR_STOP=1 -f "$ROOT/scripts/sql/seed-partner-users-auth.sql"

REST_ID="$(psql "$AUTH" -tA -c "SELECT id FROM users WHERE phone = '+243900000030' LIMIT 1")"
RENT_ID="$(psql "$AUTH" -tA -c "SELECT id FROM users WHERE phone = '+243900000031' LIMIT 1")"
if [[ -z "$REST_ID" || -z "$RENT_ID" ]]; then
  echo "Failed to read partner user ids from auth DB" >&2
  exit 1
fi
echo "Linking rides rows to restaurant=$REST_ID rental=$RENT_ID ..."
psql "$RIDES" -v ON_ERROR_STOP=1 \
  -v restaurant_user_id="$REST_ID" \
  -v rental_user_id="$RENT_ID" \
  -f "$ROOT/scripts/sql/seed-partner-links-rides.sql"

echo "Partner accounts ready:"
echo "  Admin              +243900000001  OTP 123456"
echo "  SENGA Restaurant   +243900000030  OTP 123456"
echo "  SENGA Location     +243900000031  OTP 123456"

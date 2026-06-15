#!/usr/bin/env bash
# Full backup of all DBs, then Prisma migrate deploy on each service.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Step 1: backup all databases ==="
"$ROOT/scripts/backup-db.sh"

services=(
  "auth:services/auth-service"
  "rides:services/ride-service"
  "payments:services/payment-service"
  "drivers:services/driver-service"
  "notifications:services/notification-service"
)

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-54320}"
POSTGRES_USER="${POSTGRES_USER:-mova}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-mova}"
BASE="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}"

for entry in "${services[@]}"; do
  key="${entry%%:*}"
  path="${entry##*:}"
  case "$key" in
    auth) export DATABASE_URL="${DATABASE_URL_AUTH:-$BASE/mova_auth}" ;;
    rides) export DATABASE_URL="${DATABASE_URL_RIDES:-$BASE/mova_rides}" ;;
    payments) export DATABASE_URL="${DATABASE_URL_PAYMENTS:-$BASE/mova_payments}" ;;
    drivers) export DATABASE_URL="${DATABASE_URL_DRIVERS:-$BASE/mova_drivers}" ;;
    notifications) export DATABASE_URL="${DATABASE_URL_NOTIFICATIONS:-$BASE/mova_notifications}" ;;
  esac
  echo "=== migrate $path ==="
  (cd "$path" && npx prisma migrate deploy)
done

echo "=== All migrations OK ==="

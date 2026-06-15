#!/usr/bin/env bash
# Backup all MOVA PostgreSQL databases (local Docker, CI, production).
# Usage:
#   ./scripts/backup-db.sh                    # local docker-compose (port 54320)
#   DATABASE_URL_AUTH=... ./scripts/backup-db.sh   # CI / Render via secrets
#   POSTGRES_CONTAINER=mova-postgres-1 ./scripts/backup-db.sh
#   BACKUP_ONLY=auth ./scripts/backup-db.sh   # single DB (Docker entrypoint)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-54320}"
POSTGRES_USER="${POSTGRES_USER:-mova}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-mova}"

declare -A DB_NAMES=(
  [auth]="mova_auth"
  [rides]="mova_rides"
  [payments]="mova_payments"
  [drivers]="mova_drivers"
  [notifications]="mova_notifications"
)

declare -A DB_URLS=()

for key in "${!DB_NAMES[@]}"; do
  env_var="DATABASE_URL_${key^^}"
  env_var="${env_var//NOTIFICATIONS/NOTIFICATIONS}"
  # Bash 4+ uppercase: auth -> DATABASE_URL_AUTH
  case "$key" in
    auth) url="${DATABASE_URL_AUTH:-}" ;;
    rides) url="${DATABASE_URL_RIDES:-}" ;;
    payments) url="${DATABASE_URL_PAYMENTS:-}" ;;
    drivers) url="${DATABASE_URL_DRIVERS:-}" ;;
    notifications) url="${DATABASE_URL_NOTIFICATIONS:-}" ;;
    *) url="" ;;
  esac
  if [ -z "$url" ] && [ -n "${DATABASE_URL:-}" ] && [ "${BACKUP_ONLY:-}" = "$key" ]; then
    url="$DATABASE_URL"
  fi
  if [ -z "$url" ]; then
    url="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${DB_NAMES[$key]}"
  fi
  DB_URLS[$key]="$url"
done

if [ -n "${BACKUP_ONLY:-}" ]; then
  if [ -z "${DB_URLS[$BACKUP_ONLY]:-}" ]; then
    echo "Unknown BACKUP_ONLY=$BACKUP_ONLY (auth|rides|payments|drivers|notifications)" >&2
    exit 1
  fi
  keys=("$BACKUP_ONLY")
else
  keys=(auth rides payments drivers notifications)
fi

backup_via_docker() {
  local db_name="$1"
  local out="$2"
  docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$db_name" --no-owner --no-acl >"$out"
}

backup_via_pg_dump() {
  local url="$1"
  local out="$2"
  pg_dump "$url" --no-owner --no-acl -f "$out"
}

echo "=== MOVA DB backup ($TIMESTAMP) -> $BACKUP_DIR ==="

for key in "${keys[@]}"; do
  db_name="${DB_NAMES[$key]}"
  url="${DB_URLS[$key]}"
  out="${BACKUP_DIR}/mova_${key}_${TIMESTAMP}.sql"
  echo "Backing up $key ($db_name) -> $out"
  if [ -n "${POSTGRES_CONTAINER:-}" ]; then
    backup_via_docker "$db_name" "$out"
  else
    backup_via_pg_dump "$url" "$out"
  fi
  gzip -f "$out"
  echo "  -> ${out}.gz"
done

# Retention: delete backups older than RETENTION_DAYS
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -name 'mova_*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
  echo "Retention: fichiers > ${RETENTION_DAYS} jours supprimés dans $BACKUP_DIR"
fi

echo "=== Backups complete ==="

#!/usr/bin/env bash
# Backup all MOVA PostgreSQL databases
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

declare -A DBS=(
  [auth]="postgresql://mova:mova@localhost:5432/mova_auth"
  [rides]="postgresql://mova:mova@localhost:5433/mova_rides"
  [payments]="postgresql://mova:mova@localhost:5434/mova_payments"
  [drivers]="postgresql://mova:mova@localhost:5435/mova_drivers"
  [notifications]="postgresql://mova:mova@localhost:5436/mova_notifications"
)

for name in "${!DBS[@]}"; do
  url="${DBS[$name]}"
  out="${BACKUP_DIR}/mova_${name}_${TIMESTAMP}.sql"
  echo "Backing up $name -> $out"
  pg_dump "$url" --no-owner --no-acl -f "$out"
  gzip -f "$out"
done

echo "Backups complete in $BACKUP_DIR"

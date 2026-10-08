#!/usr/bin/env bash
# Ride-service Render entrypoint: bind HTTP first, migrate in background.
# Avoid inline `$pid`/`$!` in Render dashboard dockerCommand (shells strip them).
set -euo pipefail
cd /app/services/ride-service

node dist/main.js &
APP_PID=$!

(
  export MOVA_SKIP_BACKUP="${MOVA_SKIP_BACKUP:-1}"
  /app/scripts/migrate-with-backup.sh || echo "MIGRATE_WARN"
) &

wait "$APP_PID"

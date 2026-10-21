#!/usr/bin/env bash
# Ride-service Render entrypoint — durable boot order:
#   1) wait for Postgres (avoid FATAL / P1017 during cold-start)
#   2) migrate (before HTTP / traffic)
#   3) start Nest (only then)
# Do not start HTTP in parallel with migrate — that caused exit-1 crash loops on deploy.
set -euo pipefail
cd /app/services/ride-service

export MOVA_SKIP_BACKUP="${MOVA_SKIP_BACKUP:-1}"

if [ -n "${DATABASE_URL:-}" ]; then
  /app/scripts/wait-for-postgres.sh
else
  echo "WARN: DATABASE_URL unset — skip wait-for-postgres" >&2
fi

if ! /app/scripts/migrate-with-backup.sh; then
  echo "MIGRATE_WARN: migrate failed after retries — starting app anyway" >&2
fi

exec node dist/main.js

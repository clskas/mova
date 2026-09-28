#!/usr/bin/env bash
# Backup the service database, then run Prisma migrate deploy.
# Used in Docker entrypoints and local migrate flows.
# Env:
#   MOVA_SERVICE     — auth|rides|payments|drivers|notifications (required in Docker)
#   DATABASE_URL     — connection string (set by compose / Render)
#   MOVA_SKIP_BACKUP — set to 1 to skip backup (tests only)
#
# FORBIDDEN: production seed of fake phones (+2439000000xx). This script must NEVER
# run `prisma db seed`. Local seed is explicit: APP_ENV=development RUN_SEED=true npm run prisma:seed
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${MOVA_SKIP_BACKUP:-}" != "1" ]; then
  if [ -n "${MOVA_SERVICE:-}" ]; then
    export BACKUP_ONLY="$MOVA_SERVICE"
    export BACKUP_DIR="${BACKUP_DIR:-/tmp/mova-backups}"
    mkdir -p "$BACKUP_DIR"
    echo "=== migrate-with-backup: backup $MOVA_SERVICE ==="
    if ! "$SCRIPT_DIR/backup-db.sh"; then
      # Render Postgres often flaps "starting up" on restart; aborting here causes crash loops (exit 1).
      echo "WARN: backup failed — continuing with migrate (do not block service start)" >&2
    fi
  elif [ -n "${DATABASE_URL:-}" ]; then
    echo "=== migrate-with-backup: backup (DATABASE_URL) ==="
    export BACKUP_ONLY="${BACKUP_ONLY:-auth}"
    if ! "$SCRIPT_DIR/backup-db.sh"; then
      echo "WARN: backup failed — continuing with migrate (do not block service start)" >&2
    fi
  else
    if [ "${ALLOW_MIGRATE_WITHOUT_BACKUP:-}" = "1" ]; then
      echo "WARN: MOVA_SERVICE/DATABASE_URL unset — migrate without backup (ALLOW_MIGRATE_WITHOUT_BACKUP=1)" >&2
    else
      echo "ERROR: Cannot migrate without backup — set MOVA_SERVICE or DATABASE_URL, or ALLOW_MIGRATE_WITHOUT_BACKUP=1 for tests" >&2
      exit 1
    fi
  fi
fi

# Prisma migrate deploy does not seed; still skip seed if a leftover wrapper calls it.
export PRISMA_MIGRATE_SKIP_SEED=1
if [ "${NODE_ENV:-}" = "production" ] || [ "${APP_ENV:-}" = "production" ] \
  || [ -n "${RENDER:-}" ] || [ -n "${RENDER_SERVICE_ID:-}" ] || [ -n "${RENDER_INSTANCE_ID:-}" ]; then
  export SKIP_DEMO_SEED=true
  export RUN_SEED=false
  echo "=== migrate-with-backup: production/Render — prisma db seed is FORBIDDEN (fake phones +2439000000xx) ==="
fi

echo "=== prisma migrate deploy ==="
# Retry on transient Postgres startup (P1017 / "database system is starting up").
migrate_ok=0
for attempt in 1 2 3 4 5 6 7 8; do
  if ./node_modules/.bin/prisma migrate deploy; then
    migrate_ok=1
    break
  fi
  wait_s=$((attempt * 5))
  echo "WARN: prisma migrate deploy failed (attempt $attempt/8) — retry in ${wait_s}s…" >&2
  sleep "$wait_s"
done
if [ "$migrate_ok" != "1" ]; then
  if [ -n "${RENDER:-}" ] || [ -n "${RENDER_SERVICE_ID:-}" ] || [ -n "${RENDER_INSTANCE_ID:-}" ]; then
    # Prefer a running service over a crash loop while Postgres wakes; CI deploy already backs up.
    echo "ERROR: prisma migrate deploy failed after retries — starting app anyway on Render" >&2
  else
    echo "ERROR: prisma migrate deploy failed after retries" >&2
    exit 1
  fi
fi
# Do not run `prisma db seed` here. Production must never create demo users.

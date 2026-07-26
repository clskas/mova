#!/usr/bin/env bash
# Backup the service database, then run Prisma migrate deploy.
# Used in Docker entrypoints and local migrate flows.
# Env:
#   MOVA_SERVICE     — auth|rides|payments|drivers|notifications (required in Docker)
#   DATABASE_URL     — connection string (set by compose / Render)
#   MOVA_SKIP_BACKUP — set to 1 to skip backup (tests only)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${MOVA_SKIP_BACKUP:-}" != "1" ]; then
  if [ -n "${MOVA_SERVICE:-}" ]; then
    export BACKUP_ONLY="$MOVA_SERVICE"
    export BACKUP_DIR="${BACKUP_DIR:-/tmp/mova-backups}"
    mkdir -p "$BACKUP_DIR"
    echo "=== migrate-with-backup: backup $MOVA_SERVICE ==="
    "$SCRIPT_DIR/backup-db.sh" || {
      echo "ERROR: backup failed, aborting migration" >&2
      exit 1
    }
  elif [ -n "${DATABASE_URL:-}" ]; then
    echo "=== migrate-with-backup: backup (DATABASE_URL) ==="
    export BACKUP_ONLY="${BACKUP_ONLY:-auth}"
    "$SCRIPT_DIR/backup-db.sh" || {
      echo "ERROR: backup failed, aborting migration" >&2
      exit 1
    }
  else
    if [ "${ALLOW_MIGRATE_WITHOUT_BACKUP:-}" = "1" ]; then
      echo "WARN: MOVA_SERVICE/DATABASE_URL unset — migrate without backup (ALLOW_MIGRATE_WITHOUT_BACKUP=1)" >&2
    else
      echo "ERROR: Cannot migrate without backup — set MOVA_SERVICE or DATABASE_URL, or ALLOW_MIGRATE_WITHOUT_BACKUP=1 for tests" >&2
      exit 1
    fi
  fi
fi

echo "=== prisma migrate deploy ==="
./node_modules/.bin/prisma migrate deploy

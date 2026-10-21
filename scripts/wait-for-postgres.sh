#!/usr/bin/env bash
# Wait until PostgreSQL accepts connections (Render cold-start / deploy flap).
# Env:
#   DATABASE_URL       — required
#   PG_WAIT_MAX_SEC    — default 90
#   PG_WAIT_INTERVAL   — default 3
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL required for wait-for-postgres" >&2
  exit 1
fi

MAX_WAIT="${PG_WAIT_MAX_SEC:-90}"
INTERVAL="${PG_WAIT_INTERVAL:-3}"
deadline=$((SECONDS + MAX_WAIT))
attempt=0

echo "=== wait-for-postgres: up to ${MAX_WAIT}s ==="

while (( SECONDS < deadline )); do
  attempt=$((attempt + 1))
  if command -v pg_isready >/dev/null 2>&1; then
    if pg_isready -d "$DATABASE_URL" -t 3 >/dev/null 2>&1; then
      echo "Postgres ready (pg_isready, attempt $attempt)"
      exit 0
    fi
  elif command -v psql >/dev/null 2>&1; then
    if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
      echo "Postgres ready (psql, attempt $attempt)"
      exit 0
    fi
  else
    echo "ERROR: need pg_isready or psql (postgresql-client)" >&2
    exit 1
  fi
  echo "WARN: Postgres not ready (attempt $attempt) — retry in ${INTERVAL}s…" >&2
  sleep "$INTERVAL"
done

echo "ERROR: Postgres not ready after ${MAX_WAIT}s" >&2
exit 1

#!/usr/bin/env bash
# Wait until PostgreSQL accepts connections (Render cold-start / deploy flap).
# Requires N consecutive successes — a single pg_isready can race a flap.
# Env:
#   DATABASE_URL       — required
#   PG_WAIT_MAX_SEC    — default 120
#   PG_WAIT_INTERVAL   — default 3
#   PG_WAIT_STABLE     — consecutive OK required (default 3)
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL required for wait-for-postgres" >&2
  exit 1
fi

MAX_WAIT="${PG_WAIT_MAX_SEC:-120}"
INTERVAL="${PG_WAIT_INTERVAL:-3}"
STABLE_NEED="${PG_WAIT_STABLE:-3}"
deadline=$((SECONDS + MAX_WAIT))
attempt=0
stable=0

echo "=== wait-for-postgres: up to ${MAX_WAIT}s (${STABLE_NEED} consecutive OK) ==="

probe() {
  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -d "$DATABASE_URL" -t 3 >/dev/null 2>&1
  elif command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1
  else
    echo "ERROR: need pg_isready or psql (postgresql-client)" >&2
    exit 1
  fi
}

while (( SECONDS < deadline )); do
  attempt=$((attempt + 1))
  if probe; then
    stable=$((stable + 1))
    echo "Postgres OK (attempt $attempt, stable $stable/$STABLE_NEED)"
    if (( stable >= STABLE_NEED )); then
      echo "Postgres ready (stable)"
      exit 0
    fi
  else
    if (( stable > 0 )); then
      echo "WARN: Postgres flapped after $stable OK — reset stability" >&2
    else
      echo "WARN: Postgres not ready (attempt $attempt) — retry in ${INTERVAL}s…" >&2
    fi
    stable=0
  fi
  sleep "$INTERVAL"
done

echo "ERROR: Postgres not ready after ${MAX_WAIT}s" >&2
exit 1

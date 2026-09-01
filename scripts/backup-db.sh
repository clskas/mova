#!/usr/bin/env bash
# Backup all MOVA PostgreSQL databases (local Docker, CI, production).
# Usage:
#   ./scripts/backup-db.sh                    # local docker-compose (port 54320)
#   DATABASE_URL_AUTH=... ./scripts/backup-db.sh   # CI / Render via secrets
#   POSTGRES_CONTAINER=mova-postgres-1 ./scripts/backup-db.sh
#   BACKUP_ONLY=auth ./scripts/backup-db.sh   # single DB (Docker entrypoint)
#
# Host policy (CI / production):
#   *.render.com / dpg-*.render.com  → pg_dump (production Render Postgres)
#   *.neon.tech                      → skip with a warning (legacy, not prod; do not fail)
#   pg_dump older than the server    → skip with a warning (do not fail deploy / migrate)
# GitHub Actions cannot reach Render Internal hostnames (dpg-…-a with no domain);
# those are skipped with a warning so deploy still proceeds. Use External URLs in secrets.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Hostname only — never echo the URL (passwords).
pg_url_host() {
  local url="$1"
  local rest="${url#*://}"
  if [[ "$rest" == *"@"* ]]; then
    rest="${rest##*@}"
  fi
  printf '%s' "${rest%%[:/?]*}"
}

backup_warn() {
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    echo "::warning::$1"
  else
    echo "WARN: $1" >&2
  fi
}

# Return 0 to skip this URL (do not fail the job); 1 to dump it.
should_skip_backup_url() {
  local url="$1"
  local label="$2"
  local host
  host="$(pg_url_host "$url")"

  if [[ "${host,,}" == *neon.tech ]]; then
    backup_warn "Skipping $label backup: host is Neon ($host), no longer production. Set GitHub secret DATABASE_URL_* to the Render External URL (*.render.com). Deploy continues without this dump."
    return 0
  fi

  # Render Internal hostname is only reachable on Render's network.
  if [ "${GITHUB_ACTIONS:-}" = "true" ] && [[ "$host" == dpg-* ]] && [[ "$host" != *.* ]]; then
    backup_warn "Skipping $label backup: host $host looks like a Render Internal URL (unreachable from GitHub). Use the External URL (dpg-….*.render.com). Deploy continues without this dump."
    return 0
  fi

  return 1
}

# Prefer the newest PGDG/distro pg_dump (Ubuntu noble is 16; Render mova-db-auth is 18).
resolve_pg_dump() {
  local newest="" newest_ver=0 candidate ver
  for candidate in /usr/lib/postgresql/*/bin/pg_dump; do
    [ -x "$candidate" ] || continue
    ver="${candidate#/usr/lib/postgresql/}"
    ver="${ver%%/*}"
    ver="${ver%%.*}"
    if [ "${ver:-0}" -gt "$newest_ver" ] 2>/dev/null; then
      newest_ver="$ver"
      newest="$candidate"
    fi
  done
  if [ -n "$newest" ]; then
    printf '%s' "$newest"
    return 0
  fi
  command -v pg_dump
}

PG_DUMP_BIN="${PG_DUMP_BIN:-}"
if [ -z "$PG_DUMP_BIN" ]; then
  PG_DUMP_BIN="$(resolve_pg_dump || true)"
fi

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
  if [ -z "${DB_NAMES[$BACKUP_ONLY]:-}" ]; then
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

# Returns 0 on success, 2 on server/client version mismatch (caller should skip), 1 otherwise.
# Must be invoked from `if`/`||` so a non-zero return does not trip `set -e`.
backup_via_pg_dump() {
  local url="$1"
  local out="$2"
  local err
  if [ -z "${PG_DUMP_BIN:-}" ]; then
    echo "ERROR: pg_dump not found" >&2
    return 1
  fi
  err="$(mktemp)"
  if "$PG_DUMP_BIN" "$url" --no-owner --no-acl -f "$out" 2>"$err"; then
    rm -f "$err"
    return 0
  fi
  cat "$err" >&2
  if grep -qiE 'server version mismatch|aborting because of server version' "$err"; then
    rm -f "$err" "$out"
    return 2
  fi
  rm -f "$err" "$out"
  return 1
}

skip_version_mismatch() {
  local label="$1"
  backup_warn "Skipping $label backup: pg_dump is older than the Postgres server (version mismatch). Deploy/migrate continues. Point CI at postgresql-client matching the server, or rely on Render automatic backups."
}

# Docker entrypoint : une seule base via DATABASE_URL (ex. postgres:5432)
if [ -n "${BACKUP_ONLY:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  db_name="${DB_NAMES[$BACKUP_ONLY]}"
  out="${BACKUP_DIR}/mova_${BACKUP_ONLY}_${TIMESTAMP}.sql"
  echo "=== MOVA DB backup ($TIMESTAMP) -> $BACKUP_DIR ==="
  if should_skip_backup_url "$DATABASE_URL" "$BACKUP_ONLY"; then
    echo "=== Backups skipped (legacy/unreachable host) ==="
    exit 0
  fi
  echo "Backing up $BACKUP_ONLY ($db_name) via DATABASE_URL -> $out"
  dump_rc=0
  if backup_via_pg_dump "$DATABASE_URL" "$out"; then
    dump_rc=0
  else
    dump_rc=$?
  fi
  if [ "$dump_rc" -eq 2 ]; then
    skip_version_mismatch "$BACKUP_ONLY"
    echo "=== Backups skipped (pg_dump/server version mismatch) ==="
    exit 0
  fi
  if [ "$dump_rc" -ne 0 ]; then
    exit "$dump_rc"
  fi
  gzip -f "$out"
  echo "  -> ${out}.gz"
  echo "=== Backups complete ==="
  exit 0
fi

echo "=== MOVA DB backup ($TIMESTAMP) -> $BACKUP_DIR ==="

dumped=0
skipped=0
for key in "${keys[@]}"; do
  db_name="${DB_NAMES[$key]}"
  url="${DB_URLS[$key]}"
  out="${BACKUP_DIR}/mova_${key}_${TIMESTAMP}.sql"
  if [ -z "${POSTGRES_CONTAINER:-}" ] && should_skip_backup_url "$url" "$key"; then
    skipped=$((skipped + 1))
    continue
  fi
  echo "Backing up $key ($db_name) -> $out"
  if [ -n "${POSTGRES_CONTAINER:-}" ]; then
    backup_via_docker "$db_name" "$out"
  else
    dump_rc=0
    if backup_via_pg_dump "$url" "$out"; then
      dump_rc=0
    else
      dump_rc=$?
    fi
    if [ "$dump_rc" -eq 2 ]; then
      skip_version_mismatch "$key"
      skipped=$((skipped + 1))
      continue
    fi
    if [ "$dump_rc" -ne 0 ]; then
      exit "$dump_rc"
    fi
  fi
  gzip -f "$out"
  echo "  -> ${out}.gz"
  dumped=$((dumped + 1))
done

# Retention: delete backups older than RETENTION_DAYS
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -name 'mova_*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
  echo "Retention: fichiers > ${RETENTION_DAYS} jours supprimés dans $BACKUP_DIR"
fi

if [ "$dumped" -eq 0 ] && [ "$skipped" -gt 0 ]; then
  backup_warn "No databases dumped ($skipped skipped). Deploy continues. Point DATABASE_URL_* GitHub secrets at Render External URLs to restore pre-deploy backups."
  echo "=== Backups skipped ==="
  exit 0
fi

echo "=== Backups complete (dumped=$dumped skipped=$skipped) ==="

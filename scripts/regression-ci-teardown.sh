#!/usr/bin/env bash
# Stop regression stack started by regression-ci.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PID_FILE="/tmp/mova-regression.pids"
if [ -f "$PID_FILE" ]; then
  read -r ADMIN_PID WEB_PID <"$PID_FILE" || true
  [ -n "${ADMIN_PID:-}" ] && kill "$ADMIN_PID" 2>/dev/null || true
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
  rm -f "$PID_FILE"
fi

docker compose down -v --remove-orphans 2>/dev/null || true
echo "=== Regression stack stopped ==="

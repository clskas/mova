#!/usr/bin/env bash
# Lightweight CI checks (no Docker): validate scripts + shared package smoke.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Validate shell scripts ==="
for f in scripts/backup-db.sh scripts/migrate-with-backup.sh scripts/migrate-all.sh scripts/smoke-test.sh scripts/regression-ci.sh scripts/regression-ci-teardown.sh; do
  bash -n "$f"
  echo "OK $f"
done

echo "=== Shared package quick test ==="
cd packages/shared
npm ci --silent
npm run build --silent
npm test --silent

echo "=== CI smoke scripts OK ==="

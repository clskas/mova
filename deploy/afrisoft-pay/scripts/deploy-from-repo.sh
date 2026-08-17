#!/usr/bin/env bash
# Build & load payment image on this VPS from a local checkout of the Mova monorepo.
# Usage: /opt/afrisoft-pay/scripts/deploy-from-repo.sh /path/to/Mova
set -euo pipefail
REPO_ROOT="${1:-}"
if [[ -z "$REPO_ROOT" || ! -f "$REPO_ROOT/docker/payment.Dockerfile" ]]; then
  echo "Usage: $0 /path/to/Mova  (must contain docker/payment.Dockerfile)" >&2
  exit 1
fi
cd "$REPO_ROOT"
docker build -f docker/payment.Dockerfile -t afrisoft-pay/payment:local .
cd /opt/afrisoft-pay
docker compose --profile hub up -d --force-recreate payment
docker compose --profile hub ps
echo "Health (local): curl -sS http://127.0.0.1:3000/health"

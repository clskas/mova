#!/usr/bin/env bash
# Build & load SMS hub image on this VPS from a local checkout of the Mova monorepo.
# Usage: /opt/afrisoft-sms/scripts/deploy-from-repo.sh /path/to/Mova
set -euo pipefail
REPO_ROOT="${1:-}"
if [[ -z "$REPO_ROOT" || ! -f "$REPO_ROOT/docker/sms.Dockerfile" ]]; then
  echo "Usage: $0 /path/to/Mova  (must contain docker/sms.Dockerfile)" >&2
  exit 1
fi
cd "$REPO_ROOT"
docker build -f docker/sms.Dockerfile -t afrisoft-sms/hub:local .
cd /opt/afrisoft-sms
docker compose --profile hub up -d --force-recreate sms
docker compose --profile hub ps
echo "Health (local): curl -sS http://127.0.0.1:3001/health"

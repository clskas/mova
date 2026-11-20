#!/usr/bin/env bash
# CI deploy of the AfriSoft SMS hub — the ONLY command the SMS CI deploy key may run.
#
# Installed as /opt/afrisoft-sms/scripts/ci-deploy.sh and pinned in
# /root/.ssh/authorized_keys:
#   command="/opt/afrisoft-sms/scripts/ci-deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 … senga-ci-sms-deploy
#
# stdin : `git archive` tar of the Mova monorepo at the commit to deploy.
# SSH_ORIGINAL_COMMAND : "deploy <commit-sha>" (logged only — the key cannot run anything else).
#
# Steps: skip when the hub's own sources did not change → build candidate image (live
# container untouched) → swap → /health check (Redis connected, same SMS provider as
# before) → automatic rollback to the previous image when unhealthy.
set -euo pipefail

HUB=/opt/afrisoft-sms
SRC=/opt/mova-src-sms
IMAGE=afrisoft-sms/hub
CONTAINER=afrisoft-sms-hub
COMMIT=$(printf '%s' "${SSH_ORIGINAL_COMMAND:-}" | awk '$1 == "deploy" && $2 ~ /^[0-9a-f]{7,40}$/ {print $2}')
COMMIT=${COMMIT:-unknown}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
log() { echo "[sms-deploy $STAMP] $*"; }

exec 9>/var/lock/afrisoft-sms-ci-deploy.lock
flock -n 9 || { log "another deploy is running"; exit 1; }

log "commit $COMMIT — receiving source"
rm -rf "$SRC.new"
mkdir -p "$SRC.new"
tar -x -C "$SRC.new"
[ -f "$SRC.new/docker/sms.Dockerfile" ] || { log "archive has no docker/sms.Dockerfile"; exit 1; }

# Only what docker/sms.Dockerfile copies decides whether the hub must be rebuilt, so a
# merge that touches other services does not restart the SMS hub.
inputs_hash() {
  (cd "$1" && find docker/sms.Dockerfile packages/shared services/sms-hub-service -type f \
     -not -path '*/node_modules/*' -not -path '*/dist/*' -print0 | sort -z | xargs -0 sha256sum) \
    | sha256sum | awk '{print $1}'
}
HASH=$(inputs_hash "$SRC.new")
echo "$COMMIT" > "$SRC.new/.source-commit"
echo "$HASH" > "$SRC.new/.inputs-hash"

if [ "$(cat "$SRC/.inputs-hash" 2>/dev/null)" = "$HASH" ]; then
  log "SMS hub sources unchanged since $(cat "$SRC/.source-commit" 2>/dev/null) — nothing to do"
  rm -rf "$SRC.new"
  exit 0
fi

health() { curl -s -m 5 http://127.0.0.1:3001/health || true; }
provider_of() { sed -n 's/.*"provider":"\([a-z_-]*\)".*/\1/p'; }

BEFORE=$(health)
PROVIDER=$(printf '%s' "$BEFORE" | provider_of)
log "current provider: ${PROVIDER:-unknown}"

log "building candidate image"
docker build -q -f "$SRC.new/docker/sms.Dockerfile" -t "$IMAGE:candidate" "$SRC.new"

# Keep the image the live container runs, whatever its tag, for the rollback.
PREV_ID=$(docker inspect -f '{{.Image}}' "$CONTAINER" 2>/dev/null || true)
[ -n "$PREV_ID" ] && docker tag "$PREV_ID" "$IMAGE:pre-$STAMP"
docker tag "$IMAGE:candidate" "$IMAGE:local"
cd "$HUB"
SMS_IMAGE="$IMAGE:local" docker compose --profile hub up -d --force-recreate sms

healthy() {
  local h
  h=$(health)
  echo "$h" | grep -q '"redis":"connected"' || return 1
  # Never let a deploy silently fall back to the mock provider (or any other one).
  [ -z "$PROVIDER" ] || [ "$(printf '%s' "$h" | provider_of)" = "$PROVIDER" ]
}

for _ in $(seq 1 24); do
  sleep 5
  if healthy; then
    log "healthy on $COMMIT (provider ${PROVIDER:-unknown})"
    rm -rf "$SRC.prev"
    [ -d "$SRC" ] && mv "$SRC" "$SRC.prev"
    mv "$SRC.new" "$SRC"
    # Keep the last 3 rollback images.
    docker images "$IMAGE" --format '{{.Tag}}' | grep '^pre-' | sort -r | tail -n +4 \
      | xargs -r -I{} docker rmi "$IMAGE:{}" >/dev/null 2>&1 || true
    exit 0
  fi
done

log "UNHEALTHY after 120s — rolling back"
docker logs --tail 40 "$CONTAINER" 2>&1 || true
if [ -n "$PREV_ID" ]; then
  docker tag "$IMAGE:pre-$STAMP" "$IMAGE:local"
  SMS_IMAGE="$IMAGE:local" docker compose --profile hub up -d --force-recreate sms
fi
rm -rf "$SRC.new"
exit 1

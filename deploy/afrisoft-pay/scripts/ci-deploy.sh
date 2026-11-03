#!/usr/bin/env bash
# CI deploy of the AfriSoft Pay hub — the ONLY command the CI deploy key may run.
#
# Installed as /opt/afrisoft-pay/scripts/ci-deploy.sh and pinned in
# /root/.ssh/authorized_keys:
#   command="/opt/afrisoft-pay/scripts/ci-deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 … senga-ci-hub-deploy
#
# stdin : `git archive` tar of the Mova monorepo at the commit to deploy.
# SSH_ORIGINAL_COMMAND : "deploy <commit-sha>" (logged only — the key cannot run anything else).
#
# Steps: DB backup → build candidate image (live container untouched) → swap →
# /health check → automatic rollback to the previous image when unhealthy.
set -euo pipefail

HUB=/opt/afrisoft-pay
SRC=/opt/mova-src
COMMIT=$(printf '%s' "${SSH_ORIGINAL_COMMAND:-}" | awk '$1 == "deploy" && $2 ~ /^[0-9a-f]{7,40}$/ {print $2}')
COMMIT=${COMMIT:-unknown}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
log() { echo "[hub-deploy $STAMP] $*"; }

exec 9>/var/lock/afrisoft-pay-ci-deploy.lock
flock -n 9 || { log "another deploy is running"; exit 1; }

log "commit $COMMIT — receiving source"
rm -rf "$SRC.new"
mkdir -p "$SRC.new"
tar -x -C "$SRC.new"
[ -f "$SRC.new/docker/payment.Dockerfile" ] || { log "archive has no docker/payment.Dockerfile"; exit 1; }
echo "$COMMIT" > "$SRC.new/.source-commit"

if [ "$(cat "$SRC/.source-commit" 2>/dev/null)" = "$COMMIT" ]; then
  log "commit already deployed — nothing to do"
  rm -rf "$SRC.new"
  exit 0
fi

log "backing up database"
mkdir -p "$HUB/backups"
docker exec afrisoft-pay-postgres pg_dump -U afrisoft -d afrisoft_payments | gzip > "$HUB/backups/afrisoft_payments-$STAMP.sql.gz"
ls -1t "$HUB"/backups/afrisoft_payments-*.sql.gz | tail -n +31 | xargs -r rm -f

log "building candidate image"
docker build -q -f "$SRC.new/docker/payment.Dockerfile" -t afrisoft-pay/payment:candidate "$SRC.new"

docker tag afrisoft-pay/payment:local "afrisoft-pay/payment:pre-$STAMP"
docker tag afrisoft-pay/payment:candidate afrisoft-pay/payment:local
cd "$HUB"
docker compose --profile hub up -d --force-recreate payment

healthy() {
  local h
  h=$(curl -s -m 5 http://127.0.0.1:3000/health || true)
  echo "$h" | grep -q '"database":"connected"' && echo "$h" | grep -q '"mode":"hub"'
}

for _ in $(seq 1 24); do
  sleep 5
  if healthy; then
    log "healthy on $COMMIT"
    rm -rf "$SRC.prev"
    [ -d "$SRC" ] && mv "$SRC" "$SRC.prev"
    mv "$SRC.new" "$SRC"
    # Keep the last 3 rollback images.
    docker images afrisoft-pay/payment --format '{{.Tag}}' | grep '^pre-' | sort -r | tail -n +4 \
      | xargs -r -I{} docker rmi "afrisoft-pay/payment:{}" >/dev/null 2>&1 || true
    exit 0
  fi
done

log "UNHEALTHY after 120s — rolling back"
docker logs --tail 40 afrisoft-pay-payment 2>&1 || true
docker tag "afrisoft-pay/payment:pre-$STAMP" afrisoft-pay/payment:local
docker compose --profile hub up -d --force-recreate payment
rm -rf "$SRC.new"
exit 1

#!/usr/bin/env bash
# CI regression stack: Docker microservices + Next.js admin/web for Playwright.
# Tear down with: docker compose down -v ; kill admin/web PIDs saved in /tmp/mova-regression.pids
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ADMIN_PID=""
WEB_PID=""
PID_FILE="/tmp/mova-regression.pids"

echo "=== MOVA regression stack ==="

mkdir -p config
cat > config/external-apis.env <<'EOF'
MOCK_OTP=true
MOCK_PAYMENTS=true
EOF

echo "=== Docker compose (microservices) ==="
docker compose up -d --build

echo "=== Wait for API gateway /health ==="
for i in $(seq 1 90); do
  if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
    echo "Gateway ready (attempt $i)"
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "Gateway timeout after 90 attempts" >&2
    docker compose logs api-gateway --tail 80 || true
    exit 1
  fi
  sleep 5
done

echo "=== Seed admin user (+243900000001) ==="
export DATABASE_URL="postgresql://mova:mova@localhost:54320/mova_auth"
cd "$ROOT/services/auth-service"
npm ci --silent
npx ts-node prisma/seed.ts

echo "=== Build and start admin (:3002) + web (:3001) ==="
cd "$ROOT/admin"
npm ci --silent
NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build --silent
PORT=3002 npm run start >/tmp/mova-admin.log 2>&1 &
ADMIN_PID=$!

cd "$ROOT/web"
npm ci --silent
NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build --silent
PORT=3001 npm run start >/tmp/mova-web.log 2>&1 &
WEB_PID=$!

for url in http://localhost:3002 http://localhost:3001; do
  echo "Waiting for $url"
  for i in $(seq 1 45); do
    if curl -sf -o /dev/null "$url" 2>/dev/null; then
      echo "  OK ($i)"
      break
    fi
    if [ "$i" -eq 45 ]; then
      echo "Timeout for $url" >&2
      tail -40 /tmp/mova-admin.log /tmp/mova-web.log 2>/dev/null || true
      exit 1
    fi
    sleep 2
  done
done

echo "$ADMIN_PID $WEB_PID" >"$PID_FILE"
echo "=== Regression stack ready (PIDs in $PID_FILE) ==="

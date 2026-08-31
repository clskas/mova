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
NODE_ENV=development
MOCK_OTP=true
ALLOW_TEST_OTP=true
MOCK_PAYMENTS=true
EOF

echo "=== Docker compose (microservices) ==="
# Parallel npm ci against registry.npmjs.org saturates GitHub runners (exit 146 / network).
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-2}"
export DOCKER_BUILDKIT=1
compose_ok=0
for attempt in 1 2 3; do
  echo "docker compose up --build (attempt $attempt, parallel=$COMPOSE_PARALLEL_LIMIT)"
  if docker compose up -d --build; then
    compose_ok=1
    break
  fi
  echo "docker compose failed on attempt $attempt — retrying" >&2
  sleep 20
done
if [ "$compose_ok" -ne 1 ]; then
  echo "docker compose failed after 3 attempts" >&2
  docker compose ps -a || true
  exit 1
fi

echo "=== Wait for API gateway /health/live then auth-ready /health ==="
for i in $(seq 1 90); do
  if curl -sf --max-time 3 http://127.0.0.1:3000/health/live >/dev/null 2>&1; then
    health_json="$(curl -sf --max-time 8 http://127.0.0.1:3000/health 2>/dev/null || true)"
    if echo "$health_json" | grep -qE '"name":"auth"[^}]*"status":"ok"'; then
      echo "Gateway + auth ready (attempt $i)"
      break
    fi
  fi
  if [ "$i" -eq 90 ]; then
    echo "Gateway timeout after 90 attempts" >&2
    docker compose ps -a || true
    docker compose logs api-gateway auth-service payment-service --tail 80 || true
    exit 1
  fi
  sleep 5
done

echo "=== Wait for Postgres (host port 48080) ==="
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U mova -d mova_auth >/dev/null 2>&1; then
    echo "Postgres ready (attempt $i)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "Postgres timeout" >&2
    docker compose logs postgres --tail 40 || true
    exit 1
  fi
  sleep 2
done

echo "=== Seed staff roles (+243900000001-005) ==="
# Host publish port must match docker-compose.yml (48080:5432).
export DATABASE_URL="${DATABASE_URL_AUTH:-postgresql://mova:mova@localhost:48080/mova_auth}"
cd "$ROOT/services/auth-service"
npm ci --no-workspaces --silent
npx ts-node prisma/seed-staff-roles.ts

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

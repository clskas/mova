# CI/CD

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `.github/workflows/ci.yml` | PR / push to main, develop | Build shared + all 7 services + web/admin clients, run tests |
| `.github/workflows/build-push.yml` | Push to main, version tags | Build and push Docker images to GHCR |
| `.github/workflows/deploy.yml` | Manual dispatch | Trigger Render deploys + smoke test |

## Local CI

```powershell
.\scripts\verify-all.ps1
```

Ou manuellement :

```bash
cd packages/shared && npm ci && npm run build && npm test
cd services/auth-service && npm install && npx prisma generate && npm run build
# repeat per service
cd web && npm ci && npm run build
cd admin && npm ci && npm run build
cd mobile && flutter test
```

## Docker images

Images are built from `docker/*.Dockerfile` with monorepo context (includes `packages/shared`).

```bash
docker compose build
docker compose up -d
```

## Secrets (GitHub)

- `RENDER_API_KEY` — Render deploy hook
- `RENDER_SERVICE_IDS` — space-separated Render service IDs

## Variables

- `GATEWAY_URL` — used by deploy workflow smoke test

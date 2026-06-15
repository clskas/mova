# CI/CD

## Pipeline (main)

Chaîne automatique après push sur `main` :

```
CI (unit + flutter + regression) → build-push → deploy (backup) → smoke-prod
```

| Étape | Workflow | Déclencheur | Rôle |
|-------|----------|-------------|------|
| CI | `ci.yml` | PR / push `main`, `develop` | Build, tests unitaires, **régression Playwright**, Flutter |
| Build & push | `build-push.yml` | CI réussi sur `main`, tags `v*` | Images Docker → GHCR + scan Trivy |
| Deploy | `deploy.yml` | Build & push réussi sur `main` | **Backup pg_dump**, déploiement Render |
| Smoke prod | `smoke-prod.yml` | Deploy réussi sur `main` | Health gateway, geo, estimate, OTP |

Un échec de régression **bloque** build-push et donc le déploiement auto.

## Jobs CI (`ci.yml`)

| Job | Contenu |
|-----|---------|
| `shared` | Build + tests `packages/shared` |
| `services` | Build + tests unitaires (×7) + e2e gateway |
| `clients` | Build + lint `web`, `admin` |
| **`regression`** | Docker Compose + seed admin + Playwright admin/web |
| `mobile` | `flutter test` (35+ tests unit/widget) |
| `smoke-scripts` | Validation scripts shell + smoke léger |
| `security-audit` | `npm audit` (non bloquant) |
| `codeql` | Analyse statique |

### Régression Playwright (gate CI)

1. `scripts/regression-ci.sh` — `docker compose up`, seed admin (`+243900000001` / OTP `123456`), démarre admin `:3002` et web `:3001`
2. Playwright — projets `admin` (login, users, restaurants) et `web` (accueil) + health gateway
3. `scripts/regression-ci-teardown.sh` — arrêt stack

Variables : `MOCK_OTP=true`, `E2E_REQUIRE_STACK=true` (pas de skip silencieux en CI).

**Appium mobile** : non exécuté en CI (émulateur Android lourd). Couverture mobile = `flutter test` dans le job `mobile`.

## Workflows manuels

| Workflow | Usage |
|----------|-------|
| `e2e.yml` | Régression complète manuelle (même specs Playwright) |
| `deploy.yml` | Déploiement manuel staging/production |
| `smoke-prod.yml` | Smoke prod avec URL gateway custom |

## Local CI

```powershell
.\scripts\verify-all.ps1
```

Régression locale (stack Docker requise) :

```powershell
# Terminal 1 — stack
docker compose up -d
npm run seed:admin-demo

# Terminal 2 — admin
cd admin; npm run dev

# Terminal 3 — tests
cd e2e
npm ci
npm run playwright:install
$env:E2E_REQUIRE_STACK = "true"
npm run test:e2e:admin
npm run test:e2e:web
```

Ou script tout-en-un (Linux / Git Bash / CI) :

```bash
./scripts/regression-ci.sh
cd e2e && npm ci && npx playwright install chromium
E2E_REQUIRE_STACK=true npm run test:e2e:admin
E2E_REQUIRE_STACK=true npm run test:e2e:web
./scripts/regression-ci-teardown.sh
```

## Backup avant migration

- **Production (Render)** : `deploy.yml` exécute `scripts/backup-db.sh` avant déploiement (secrets `DATABASE_URL_*`)
- **Conteneurs Docker** : entrypoint `scripts/migrate-with-backup.sh` (backup puis `prisma migrate deploy`)
- **Local** : `scripts/migrate-all.sh` (backup complet puis migrations)

## Docker images

Images construites depuis `docker/*.Dockerfile` avec contexte monorepo (`packages/shared` inclus).

```bash
docker compose build
docker compose up -d
```

## Secrets (GitHub)

| Secret | Usage |
|--------|-------|
| `RENDER_API_KEY` | API Render deploy hooks |
| `RENDER_SERVICE_IDS` | IDs services Render (espace-séparés) |
| `GATEWAY_RENDER_SERVICE_ID` | Attente statut deploy gateway |
| `DATABASE_URL_AUTH` … `DATABASE_URL_NOTIFICATIONS` | Backup pg_dump prod |
| `SMOKE_API_URL` | URL gateway pour smoke prod |

## Variables

| Variable | Usage |
|----------|-------|
| `GATEWAY_URL` / `vars.GATEWAY_URL` | Smoke tests post-deploy |

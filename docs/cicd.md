# CI/CD

## Pipeline (main)

Chaîne automatique après push sur `main` :

```
CI (unit + flutter + regression) → build-push → deploy (backup) → smoke-prod → mobile-release (AAB)
```

| Étape | Workflow | Déclencheur | Rôle |
|-------|----------|-------------|------|
| CI | `ci.yml` | PR / push `main`, `develop` | Build, tests unitaires, **régression Playwright**, Flutter |
| Build & push | `build-push.yml` | CI réussi sur `main`, tags `v*` | Images Docker → GHCR + scan Trivy |
| Deploy | `deploy.yml` | Build & push réussi sur `main` | **Backup pg_dump**, déploiement Render |
| Smoke prod | `smoke-prod.yml` | Deploy réussi sur `main` | Health gateway, geo, estimate, OTP |
| **Mobile release** | `mobile-release.yml` | Smoke prod OK sur `main`, tag `v*`, manuel | Build AAB passager + chauffeur ; upload stores sur tag / approbation |

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
| `mobile-release.yml` | Build AAB/IPA ; upload Play Store / TestFlight (tag `v*` ou option manuelle) |

## Pipeline mobile (`mobile-release.yml`)

Chaîne après déploiement backend réussi :

```mermaid
flowchart LR
  A[push main] --> B[CI]
  B --> C[build-push]
  C --> D[deploy]
  D --> E[smoke-prod]
  E --> F[mobile-release build AAB]
  G[tag v*] --> F
  F --> H{production-mobile}
  H --> I[Play internal]
  H --> J[TestFlight]
```

| Déclencheur | Comportement |
|-------------|--------------|
| `workflow_run` smoke-prod OK sur `main` | Build AAB passager + chauffeur, artefacts GitHub |
| Tag `v*` (ex. `v1.2.0`) | Build + upload Play Store internal + TestFlight (si secrets configurés) |
| `workflow_dispatch` | Build ; cocher « upload » pour publier (environnement `production-mobile`) |

### Apps Android (flavors)

| Flavor | Package ID | Entrée |
|--------|------------|--------|
| passager | `cd.mova.mova.passenger` | `lib/main_passenger.dart` |
| chauffeur | `cd.mova.mova.driver` | `lib/main_driver.dart` |

### Fastlane

| Plateforme | Lane | Cible |
|------------|------|-------|
| Android | `deploy_internal` | Play Console — piste **internal** (×2 apps) |
| iOS | `beta` | TestFlight — app passager (`cd.mova.mova`) |

L'app chauffeur iOS nécessite un schéma Xcode / bundle ID dédié (non configuré) — voir section iOS ci-dessous.

### Build local (parité CI)

```powershell
.\scripts\build-mobile-release.ps1
```

```bash
source mobile/scripts/set-prod-env.sh
cd mobile
flutter build appbundle --release --flavor passenger -t lib/main_passenger.dart $MOVA_DART_DEFINES
```

### Signature Android

1. Copier `mobile/android/key.properties.example` → `mobile/android/key.properties`
2. Générer `upload-keystore.jks` (voir commentaires dans l'exemple)
3. En CI : encoder le `.jks` en base64 → secret `ANDROID_KEYSTORE_BASE64`

Sans keystore, le workflow produit des AAB signés debug (téléchargeables mais **non publiables** sur Play Store).

### iOS (macOS requis)

- Build IPA : runner `macos-latest` (coût ×10 vs Linux)
- Certificats : [fastlane match](https://docs.fastlane.tools/actions/match/) + dépôt privé certificats
- Alternative : [Codemagic](https://codemagic.io) ou Xcode Cloud si pas de runner macOS GitHub

Secrets App Store Connect requis pour TestFlight — voir tableau ci-dessous.

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
| **`PROD_API_URL`** | `--dart-define=API_URL` builds mobile (ex. `https://api.mova.cd/api`) |
| **`PROD_WS_URL`** | `--dart-define=WS_URL` builds mobile (ex. `https://api.mova.cd`) |
| **`ANDROID_KEYSTORE_BASE64`** | Keystore release encodé base64 |
| **`ANDROID_KEYSTORE_PASSWORD`** | Mot de passe keystore |
| **`ANDROID_KEY_PASSWORD`** | Mot de passe clé |
| **`ANDROID_KEY_ALIAS`** | Alias clé (ex. `mova-upload`) |
| **`PLAY_STORE_JSON_KEY`** | JSON compte de service Google Play (base64) |
| **`APP_STORE_CONNECT_KEY_ID`** | Clé API App Store Connect |
| **`APP_STORE_CONNECT_ISSUER_ID`** | Issuer ID App Store Connect |
| **`APP_STORE_CONNECT_API_KEY`** | Contenu `.p8` encodé base64 |
| **`MATCH_PASSWORD`** | Mot de passe chiffrement certificats match |
| **`MATCH_GIT_BASIC_AUTHORIZATION`** | Token lecture dépôt certificats (base64 `user:token`) |
| `APPLE_ID` | (optionnel) Compte développeur Apple |

### Environnement GitHub `production-mobile`

Protège les jobs d'upload Play Store / TestFlight (approbation manuelle recommandée avant publication stores).

## Variables

| Variable | Usage |
|----------|-------|
| `GATEWAY_URL` / `vars.GATEWAY_URL` | Smoke tests post-deploy |

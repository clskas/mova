# SENGA — Morning Brief (go-live tests en ligne)

**Date:** 2026-07-27 · **Repo:** [afri-soft-com/mova](https://github.com/afri-soft-com/mova) · **Branch:** `main`  
**Pass overnight:** production-readiness (UI FR, sécurité, CI/CD, backup→migrate, AAB→Play, web deploy)

---

## Ce qui a été fait cette nuit

### Interfaces (messages utilisateur)
- Helpers FR `sanitizeUserMessage` / `toUserErrorMessage` / `sanitizeAdminError` sur **mobile**, **web**, **admin**, **restaurant**, **rental-partner**.
- Filtrage des fuites techniques : codes `MOVA_*` / `SENGA_*`, Prisma, Nest, stack traces, HTTP bruts, Exception…
- Admin login : OTP non prérempli ; téléphone démo masqué en production ; erreurs sanitizées.
- Wallet mobile : libellé « MOCK_PAYMENTS » retiré de l’UI (simulation hors prod uniquement si `isMockMode`).

### Sécurité
- `packages/shared/src/prod-security.ts` : refus JWT / `INTERNAL_API_KEY` faibles, `MOCK_OTP=true` interdit en prod, CORS via `CORS_ORIGIN`.
- Tous les services Nest appellent `assertProductionSecurity` + `resolveCorsOrigin` + JWT via `resolveJwtSecret`.
- `mockCode` OTP **jamais** renvoyé si `NODE_ENV=production`.
- Helmet sur api-gateway.

### CI/CD (chaîne ordonnée)
```
CI → Build and Push (GHCR) → Deploy (backup DB obligatoire → Render) → Smoke prod → Mobile Release (AAB → Play internal)
```
- Clients CI : `web`, `admin`, `restaurant`, `rental-partner`.
- Audit npm : **critical = fail**, high = warning.
- Deploy : backup `DATABASE_URL_*` **obligatoire** (sinon exit 1 ; override manuel `skip_backup` / urgence seulement).
- Conteneurs Prisma : `scripts/migrate-with-backup.sh` (backup puis migrate ; échec backup = pas de migrate).
- Render Blueprint : `mova-web`, `mova-admin-web`, `mova-restaurant`, `mova-rental-partner`.
- Mobile : upload Play **auto** après build AAB réussi si secret Play présent (env GitHub `production-mobile`).

---

## Secrets / variables GitHub à configurer (bloquants go-live)

### Déploiement & smoke
| Secret / var | Obligatoire | Usage |
|--------------|-------------|--------|
| `RENDER_API_KEY` | Oui | Trigger deploys Render |
| `RENDER_SERVICE_IDS` | Oui* | IDs services (ou `config/render-services.json`) |
| `GATEWAY_RENDER_SERVICE_ID` | Oui | Attente live gateway |
| `DATABASE_URL_AUTH`…`_NOTIFICATIONS` | Oui | Backup pg_dump pré-deploy |
| `SMOKE_API_URL` ou `vars.GATEWAY_URL` | Oui | Smoke post-deploy |
| `CORS_ORIGIN` (Render env) | Oui | Origines web/admin/partenaires (sinon CORS navigateur refusé) |

\* Ou fichier `config/render-services.json` commit/à jour avec IDs.

### Mobile / Play Store
| Secret | Obligatoire pour stores | Usage |
|--------|-------------------------|--------|
| `PROD_API_URL` | Oui builds | ex. `https://…/api` |
| `PROD_WS_URL` | Oui builds | ex. `https://…` |
| `ANDROID_KEYSTORE_BASE64` | Oui publication | Keystore release |
| `ANDROID_KEYSTORE_PASSWORD` | Oui | |
| `ANDROID_KEY_PASSWORD` | Oui | |
| `ANDROID_KEY_ALIAS` | Oui | |
| `PLAY_STORE_JSON_KEY` | Oui upload auto | Compte service Play (JSON **base64**) — alias acceptés : `PLAY_STORE_JSON`, `PLAY_SERVICE_ACCOUNT_JSON` |

Environnement GitHub **`production-mobile`** : activer une approbation manuelle recommandée avant publication stores.

### APIs métier (Render / env prod)
```
MOCK_OTP=false
MOCK_PAYMENTS=false
JWT_SECRET=…          # ≥ 32 caractères
INTERNAL_API_KEY=…    # ≥ 24 caractères
TWILIO_* / Verify
ORANGE_MONEY_* / MPESA_* / AIRTEL_*
MAPBOX_ACCESS_TOKEN
FCM_SERVER_KEY
```

Détail : [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md) · [docs/cicd.md](docs/cicd.md)

---

## Comment déployer demain matin

1. Vérifier les secrets ci-dessus sur le repo **afri-soft-com/mova**.
2. Push sur `main` (ou laisser tourner le pipeline du commit overnight).
3. Suivre Actions : **CI** → **Build and Push** → **Deploy** → **Smoke Tests Production** → **Mobile Release**.
4. Si Play upload skip : vérifier `PLAY_STORE_JSON_KEY` + approbation env `production-mobile` ; les AAB restent en artefacts Actions.
5. Smoke manuel optionnel :
   ```powershell
   $env:GATEWAY_URL = "https://<gateway>"
   bash ./scripts/smoke-test.sh
   ```
6. Migrations locales / Docker :
   ```powershell
   npm run migrate:all          # backup puis prisma deploy (Windows)
   # Conteneurs : migrate-with-backup.sh déjà dans les Dockerfiles Prisma
   ```

---

## Blockers résiduels / risques

1. **Secrets Play / keystore** absents → AAB construits mais non publiés (skip gracieux).
2. **Twilio / mobile money** non configurés → OTP réel et paiements réels indisponibles (MOCK interdit en prod pour OTP).
3. **`CORS_ORIGIN`** doit lister les URLs finales des frontends sinon navigateurs bloqués.
4. **Portails restaurant / rental** : images + Blueprint prêts ; IDs Render doivent être dans `RENDER_SERVICE_IDS` / `render-services.json`.
5. **Appium mobile e2e** : non exécuté en CI (volontaire) — couverture = `flutter test` + smoke API.
6. **iOS / TestFlight** : hors chemin critique Android ; secrets Apple toujours optionnels.
7. Images GHCR : Render Blueprint utilise encore build Docker depuis le repo (pas forcément pull GHCR) — cohérent si Render build-from-Dockerfile.

---

## Quick start local (tests)

```powershell
cd c:\Users\Administrator\Mova
docker compose up -d --build
npm run migrate:all
npm run seed:admin-demo

# Web :3001 · Admin :3002 · Restaurant :3007 · Location :3008
# OTP démo local uniquement si MOCK_OTP=true → 123456
```

| Client | URL | Auth démo |
|--------|-----|-----------|
| Gateway | http://localhost:3000 | — |
| Web PWA | http://localhost:3001 | OTP `123456` si mock |
| Admin | http://localhost:3002/login | `+243900000001`–`005` / OTP mock |
| Restaurant | http://localhost:3007 | Compte partenaire seed |
| Location | http://localhost:3008 | Compte partenaire seed |

---

*Brief overnight 2026-07-26/27 — prêt pour tests en ligne dès secrets configurés.*

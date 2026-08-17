# Déploiement production SENGA — lancement national RDC

Guide opérationnel pour mettre en production SENGA sur **l’ensemble des 32 zones de service** en République Démocratique du Congo, simultanément.

> **Prérequis** : accès GitHub, compte [Render](https://render.com), domaine `mova.cd` (ou équivalent), comptes Twilio / mobile money / FCM, stores Apple & Google.

---

## 1. Vue d’ensemble

| Composant | Technologie | Hébergement |
|-----------|-------------|-------------|
| API Gateway + 6 microservices | NestJS, Docker | Render Web Services |
| Bases de données | PostgreSQL (×5) | Render PostgreSQL |
| Cache / événements | Redis | Render Redis |
| Frontend web | Next.js | Render (`mova-web`) |
| Console admin | Next.js | Render ou Vercel |
| App mobile passager / chauffeur | Flutter | App Store + Play Store |

Architecture détaillée : [architecture.md](./architecture.md).

---

## 2. Infrastructure Render & Docker

### 2.1 Blueprint Render

Le fichier `render.yaml` à la racine définit :

- **Redis** : `mova-redis`
- **7 services API Docker** : gateway, auth, ride, payment, driver, notification, admin-service
- **5 bases PostgreSQL** : auth, rides, payments, drivers, notifications
- **Frontends Next.js** : `mova-web`, `mova-admin-web`, `mova-restaurant`, `mova-rental-partner`

**Déploiement initial :**

1. Connecter le dépôt GitHub à Render.
2. Créer un **Blueprint** depuis `render.yaml`.
3. Valider les noms de services et régions (**Francfort** ou **Virginie** — latence RDC à tester).
4. Laisser Render générer `JWT_SECRET`, `INTERNAL_API_KEY` et les `DATABASE_URL`.

### 2.2 Build Docker local (validation)

```bash
cp config/services.env.example .env
# Éditer .env — JWT_SECRET, DATABASE_URL, MOCK_OTP=false, MOCK_PAYMENTS=false

docker compose up -d --build
```

Vérifier :

```bash
curl -s http://localhost:3000/health | jq .
```

### 2.3 Plans & scaling

| Service | Plan minimal prod | Notes |
|---------|-------------------|-------|
| Gateway | Starter → Standard | Point d’entrée unique |
| ride-service | Standard | Charge la plus élevée |
| Redis | Starter | Sessions, matching, events |
| PostgreSQL | Starter → Standard | Sauvegardes activées |

Augmenter les instances **gateway** et **ride-service** avant le lancement national si trafic attendu > 1 000 courses/jour.

---

## 3. Variables d’environnement

Copier `config/services.env.example` et configurer **tous** les services.

### 3.1 Variables partagées (obligatoires)

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret partagé (≥ 32 caractères aléatoires) — **identique** sur tous les services |
| `JWT_EXPIRES_IN` | Ex. `7d` |
| `INTERNAL_API_KEY` | Clé inter-services (`x-internal-api-key`) |
| `REDIS_URL` | URL Redis Render |
| `CORS_ORIGIN` | `https://app.mova.cd,https://admin.mova.cd` |

### 3.2 Désactiver les mocks

```env
MOCK_OTP=false
MOCK_PAYMENTS=false
```

### 3.3 APIs externes (groupe `mova-external-apis` sur Render)

> **Mobile Money SerdiPay n’est pas un secret Render.** Les credentials marchand (`SERDIPAY_EMAIL` / `PASSWORD` / `API_ID` / `API_PASSWORD` / `MERCHANT_CODE` / `MERCHANT_PIN` / `WEBHOOK_SECRET`) vont sur le **VPS hub** : `/opt/afrisoft-pay/.env` (`pay.afri-soft.com`, IP `178.104.82.66`). GitHub Actions ou `mova-payment` **ne remplacent pas** ce fichier — SerdiPay n’accepte que cette IP. Voir [AFRISOFT_PAYMENT_HUB_API.md](./AFRISOFT_PAYMENT_HUB_API.md) §8–9 et `deploy/afrisoft-pay/README.md`.

| Variable | Usage |
|----------|-------|
| `SERDIPAY_EMAIL` / `SERDIPAY_PASSWORD` | **VPS hub** — auth Public API `get-token` (alias : `SERDIPAY_CLIENT_ID` / `SERDIPAY_CLIENT_SECRET`) |
| `SERDIPAY_API_ID` | **VPS hub** — `api_id` du corps paiement |
| `SERDIPAY_API_PASSWORD` | **VPS hub** — `api_password` du corps ; **optionnel**, défaut = `SERDIPAY_PASSWORD` |
| `SERDIPAY_MERCHANT_CODE` / `SERDIPAY_MERCHANT_PIN` | **VPS hub** — code marchand + PIN |
| `SERDIPAY_SMS_API_ID` / `SERDIPAY_SMS_API_KEY` | Credentials SMS API (doc `sms-api.pdf`) — distincts du paiement |
| `SERDIPAY_SMS_BASE_URL` / `SERDIPAY_SMS_PATH` | Défauts `https://serdipay.com` + `/api/sms-api/v1/send` |
| `SERDIPAY_SMS_SENDER_ID` | Sender alphanumérique SerdiPay (ex. `SerdiPay`) |
| `SMS_PROVIDER` | `africastalking` \| `serdipay` \| `twilio` — switch **explicite**, sans fallback (voir [SMS_OTP_PROVIDERS.md](./SMS_OTP_PROVIDERS.md)) |
| `AFRICAS_TALKING_USERNAME` / `AFRICAS_TALKING_API_KEY` | App AT (ex. `mova`) + API key — voir [AFRICAS_TALKING_SMS.md](./AFRICAS_TALKING_SMS.md) |
| `AFRICAS_TALKING_ENV` | `production` pour vrais `+243` (`sandbox` = tests AT seulement) |
| `AFRICAS_TALKING_SMS_SENDER` | Alphanumeric / shortcode approuvé (ex. `MOVA`) |
| `MOBILE_MONEY_GATEWAY` | `serdipay` (défaut) \| `cinetpay` \| `africastalking` \| `legacy` \| `mock` — switch sticky (voir [MOBILE_MONEY_PROVIDER_ALTERNATIVES.md](./MOBILE_MONEY_PROVIDER_ALTERNATIVES.md)) |
| `CINETPAY_API_KEY` / `CINETPAY_SITE_ID` / `CINETPAY_SECRET_KEY` | Failover CinetPay (hub) |
| `CINETPAY_NOTIFY_URL` | `https://pay.afri-soft.com/webhooks/cinetpay` |
| `ALLOW_TEST_OTP` | `true` tant que SMS réel indisponible (OTP `123456` sur numéros seed uniquement) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Stockage documents (projet **senga**, buckets `uploads` + `kyc-docs`) |
| `TWILIO_*` | Secours OTP SMS |
| `FCM_SERVER_KEY` | Push notifications |
| `MAPBOX_ACCESS_TOKEN` | Autocomplétion adresses nationale RDC (recommandé — sans token, Nominatim/Photon OSM peut omettre des lieux) |
| `MOBILE_PASSENGER_VERSION` / `MOBILE_DRIVER_VERSION` | Version store courante (bannière in-app). Défaut `1.0.2`. **Lever après upload Play** (ex. `1.0.3`) — `GET /api/public/app-version` (sans auth, ride-service) |
| `MOBILE_MIN_VERSION` | Version minimale (force-update). Défaut `1.0.0` |
| `PLAY_STORE_PASSENGER_URL` / `PLAY_STORE_DRIVER_URL` | Liens Play ouverts par « Mettre à jour » |

### 3.3.1 OTP — comportement production

| `MOCK_OTP` | Comportement |
|------------|--------------|
| `true` (dev/staging) | Code fixe **123456**, pas d'SMS réel |
| `false` (prod) | Code aléatoire 6 chiffres, envoi via provider SMS réel |

OTP SMS : bascule **AT ↔ SerdiPay** via `SMS_PROVIDER` — guide [SMS_OTP_PROVIDERS.md](./SMS_OTP_PROVIDERS.md). AT détail : [AFRICAS_TALKING_SMS.md](./AFRICAS_TALKING_SMS.md). Tant que le SMS réel n’est pas validé : **garder `ALLOW_TEST_OTP=true`** sur `mova-auth`.

Sans provider SMS avec `MOCK_OTP=false` et sans `ALLOW_TEST_OTP`, l'API renvoie une erreur HTTP 503 en français (*« Service SMS non configuré »*).

### 3.3.2 Paiements — comportement production

| `MOCK_PAYMENTS` | Comportement |
|-----------------|--------------|
| `true` (dev) | Mobile money simulé, succès immédiat |
| `false` (prod) | SerdiPay C2B (`payment-client`) / B2C (`payment-merchant`) ; telecom `OM` / `MP` / `AM` / `AF` |

Le **portefeuille SENGA** (`POST /api/wallet/top-up`, `POST /api/payments/rides/:id`) persiste toujours en PostgreSQL, mock ou réel.

Sans credentials marchand SerdiPay **sur le VPS hub** (ou secours AT/legacy), l'API renvoie un message d'erreur explicite listant les variables manquantes (voir `config/external-apis.env.example`). Callback public : `POST https://pay.afri-soft.com/webhooks/serdipay` (Nest : `POST /api/payments/webhooks/serdipay`).

### 3.3.3 Supabase Storage (documents)

Projet Supabase **senga** (`furttqrltkwirdhiktdl`, région `eu-central-1` Frankfurt) :
- Buckets privés : `uploads` (photos métier), `kyc-docs` (KYC)
- Uploads via `SUPABASE_SERVICE_ROLE_KEY` uniquement côté serveurs (`ride-service` UploadsService)
- Coller la clé **service_role** depuis le dashboard Supabase → Project Settings → API (ne jamais commit)

### 3.4 URLs inter-services (Render les injecte via `fromService`)

- `AUTH_SERVICE_URL`, `RIDE_SERVICE_URL`, `PAYMENT_SERVICE_URL`, etc.
- `NEXT_PUBLIC_API_URL` → URL publique du gateway (`https://api.mova.cd`)

### 3.5 Mobile (build CI)

```bash
flutter build apk --release \
  --dart-define=API_URL=https://api.mova.cd/api \
  --dart-define=WS_URL=https://api.mova.cd
```

---

## 4. Migrations base de données

Chaque service Prisma exécute `prisma migrate deploy` au démarrage du conteneur.

**Ordre recommandé** (ou script racine) :

```bash
npm run migrate:all
```

Services concernés : auth, ride, payment, driver, notification.

**Vérification manuelle :**

```bash
docker compose exec ride-service npx prisma migrate status
```

---

## 5. Seeding & données initiales

### 5.1 Ride service (tarifs, communes, restaurants)

```bash
npm run seed:rides
# ou
docker compose exec ride-service npx prisma db seed
```

Le seed crée :

- **Communes/quartiers** pour les **32 villes** (`DRC_SERVICE_AREAS`)
- **Règles tarifaires** par ville et type de véhicule
- Restaurants exemple (Kinshasa, Lubumbashi, Goma)
- Véhicules location, surcharges, politiques d’annulation

### 5.2 Compte administrateur

```bash
npm run seed:admin
# Données démo optionnelles :
npm run seed:admin-demo
```

Configurer au minimum un **super-admin** avec permissions complètes.

### 5.3 Chauffeurs pilotes (optionnel)

Inscrire des chauffeurs test dans chaque zone prioritaire via l’app chauffeur ou l’API `driver-service`.

---

## 6. DNS & SSL

| Enregistrement | Type | Cible |
|----------------|------|-------|
| `api.mova.cd` | CNAME | `mova-gateway.onrender.com` |
| `app.mova.cd` | CNAME | `mova-web.onrender.com` |
| `admin.mova.cd` | CNAME | service admin Render |

Render provisionne **TLS automatique** (Let’s Encrypt) une fois le domaine personnalisé ajouté dans chaque service.

**Checklist DNS :**

- [ ] Propagation DNS vérifiée (`dig api.mova.cd`)
- [ ] HTTPS actif sur gateway, web, admin
- [ ] `CORS_ORIGIN` mis à jour avec les domaines finaux
- [ ] Deep links mobile (`mova://`) configurés si utilisés

---

## 7. Builds App Store & Play Store

### 7.0 CI/CD automatisé

Le workflow `mobile-release.yml` enchaîne après smoke-prod sur `main` :

| Étape | Automatique | Condition |
|-------|-------------|-----------|
| Build AAB passager + chauffeur | Oui | Smoke prod vert sur `main` |
| Artefacts GitHub (AAB) | Oui | Idem |
| Upload Play Store internal | Oui après AAB | `PLAY_STORE_JSON_KEY` (base64) ou `PLAY_STORE_JSON` + keystore ; skip gracieux si absent |
| Build IPA + TestFlight | Sur tag `v*` ou manuel | Runner macOS + certificats Apple |

Configurer les secrets listés dans [cicd.md](./cicd.md#secrets-github) et l'environnement GitHub `production-mobile` (approbation avant upload stores).

Build local équivalent :

```powershell
.\scripts\build-mobile-release.ps1
```

### 7.1 Préparation

- Version : incrémenter dans `mobile/pubspec.yaml`
- Icônes, splash, captures **français (fr-CD)**
- Texte store : couverture **32 villes RDC**, pas Kinshasa seul
- Politique confidentialité : `mobile/assets/legal/privacy_fr.md`
- CGU : `mobile/assets/legal/cgu_fr.md`

### 7.2 Android

**CI (recommandé)** : déclenché automatiquement après smoke-prod ou via tag `v*`.

**Manuel** :

```bash
cd mobile
source scripts/set-prod-env.sh
flutter build appbundle --release --flavor passenger -t lib/main_passenger.dart $MOVA_DART_DEFINES
flutter build appbundle --release --flavor driver -t lib/main_driver.dart $MOVA_DART_DEFINES
```

Packages : `cd.mova.mova.passenger`, `cd.mova.mova.driver`.

Fastlane (upload internal) : `cd mobile/android && bundle exec fastlane deploy_internal`

Signature : copier `android/key.properties.example` → `key.properties` + keystore (voir [cicd.md](./cicd.md)).

### 7.3 iOS

> **Prérequis** : runner macOS (GitHub Actions `macos-latest`), certificats via fastlane match, clé API App Store Connect. Sans ces secrets, seul Android est entièrement automatisé en CI.

**CI** : job `build-ios` sur tag `v*` ; lane `beta` → TestFlight.

**Manuel** :

```bash
cd mobile
source scripts/set-prod-env.sh
flutter build ipa --release -t lib/main_passenger.dart $MOVA_DART_DEFINES
cd ios && bundle exec fastlane beta
```

Bundle ID actuel : `cd.mova.mova` (passager). L'app chauffeur iOS nécessite un schéma Xcode dédié.

### 7.4 Review stores

- Compte test OTP : configurer un numéro de démo ou `MOCK_OTP=true` **uniquement** sur environnement staging
- Vidéo de démonstration montrant une course hors Kinshasa (ex. Lubumbashi)

---

## 8. Configuration admin

1. Ouvrir `https://admin.mova.cd`
2. Se connecter avec le compte seed admin
3. **Paramètres → Zones & communes** : vérifier les 32 villes
4. **Tarification** : confirmer les règles par ville (seed ou ajustement manuel)
5. **Restaurants** : activer partenaires par ville
6. **Incidents / support** : configurer contacts `support@mova.cd`

---

## 9. Monitoring & observabilité

### 9.1 Health checks Render

Chaque service expose `GET /health` :

```bash
curl -s https://api.mova.cd/health
```

Réponse attendue : `status: "ok"`, `coverage: "RDC"`.

### 9.2 Logs

- Render Dashboard → Logs par service
- Filtrer `ERROR` sur `ride-service` et `payment-service`

### 9.3 Alertes recommandées

| Métrique | Seuil |
|----------|-------|
| Gateway 5xx | > 1 % sur 5 min |
| Health degraded | immédiat |
| Redis mémoire | > 80 % |
| PostgreSQL connexions | > 80 % du plan |

### 9.4 Sauvegardes DB

**Avant chaque migration ou déploiement**, une sauvegarde `pg_dump` est exécutée automatiquement :

| Contexte | Mécanisme |
|----------|-----------|
| Local Docker | `npm run backup:db` ou `.\scripts\backup-db.ps1` |
| Migrations locales | `npm run migrate:all` (backup puis Prisma) |
| Conteneurs Docker / Render | `migrate-with-backup.sh` au démarrage de chaque service Prisma |
| CI deploy (`deploy.yml`) | `backup-db.sh` + artefact GitHub (14 jours) |

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh
# Fichiers : backups/mova_<service>_YYYYMMDD_HHMMSS.sql.gz
```

**Rétention** : 14 jours en local (`BACKUP_RETENTION_DAYS`) et sur les artefacts CI.

Activer en complément les **sauvegardes automatiques Render** sur chaque base PostgreSQL.

Détail pipeline : [cicd.md](./cicd.md).

---

## 10. Tests de fumée (smoke tests)

### 10.1 Backend

```bash
export GATEWAY_URL=https://api.mova.cd
./scripts/smoke-test.sh
```

Windows :

```powershell
.\scripts\smoke-gateway.ps1
```

### 10.2 Flux métier minimal

| # | Test | Résultat attendu |
|---|------|------------------|
| 1 | OTP `+243812345678` | 200 (ou Twilio réel) |
| 2 | `GET /api/geo/service-areas` | 32 zones |
| 3 | Estimation course Lubumbashi | Prix CDF retourné |
| 4 | Estimation inter-villes Kinshasa → Goma | Majoration inter-villes |
| 5 | Création livraison colis | `201` |
| 6 | Admin login + dashboard | KPIs chargés |

### 10.3 Mobile E2E (local / CI)

```bash
npm run test:mobile
```

Voir [testing-e2e.md](./testing-e2e.md).

### 10.4 Tests unitaires

```bash
npm run build:shared
npm run test:gateway
npm run test:flutter
```

---

## 11. Rollback

### 11.1 Services Render

1. Render → service → **Deploys** → **Rollback** vers le déploiement précédent stable.
2. Répéter pour gateway puis ride-service en priorité.

### 11.2 Migrations Prisma

Les migrations sont **forward-only**. En cas de migration problématique :

1. Restaurer la base depuis backup Render.
2. Déployer l’ancienne image Docker (tag Git précédent).

### 11.3 Mobile

- **Android** : déployer version précédente sur Play Console (piste production).
- **iOS** : soumettre build précédent ou retirer la version via App Store Connect.

### 11.4 Feature flags d’urgence

- `MOCK_OTP=true` / `MOCK_PAYMENTS=true` : **staging uniquement**, jamais en prod nationale.

---

## 12. Checklist lancement national

### Infrastructure
- [ ] Blueprint Render déployé (7 services + Redis + 5 DB)
- [ ] Domaines custom + SSL actifs
- [ ] `MOCK_OTP=false`, `MOCK_PAYMENTS=false`
- [ ] Twilio / mobile money / FCM configurés
- [ ] Sauvegardes DB activées

### Données
- [ ] `npm run migrate:all` OK
- [ ] `npm run seed:rides` — tarifs **32 villes**
- [ ] `npm run seed:admin` — compte admin
- [ ] Restaurants / chauffeurs pilotes par zone prioritaire

### Applications
- [ ] Web `app.mova.cd` pointe vers `NEXT_PUBLIC_API_URL` prod
- [ ] Admin `admin.mova.cd` opérationnel
- [ ] APK/AAB + IPA soumis aux stores
- [ ] Builds mobile avec `API_URL` production (`PROD_API_URL` / `PROD_WS_URL` secrets GitHub)
- [ ] Keystore Android + `PLAY_STORE_JSON_KEY` configurés
- [ ] Apps créées sur Play Console (`cd.mova.mova.passenger`, `cd.mova.mova.driver`)
- [ ] Certificats iOS + App Store Connect API (TestFlight)

### Validation
- [ ] Smoke tests gateway OK
- [ ] Course test dans ≥ 3 villes (ex. Kinshasa, Lubumbashi, Goma)
- [ ] Trajet inter-villes testé
- [ ] Paiement mobile money test réel (petit montant)
- [ ] Notifications push reçues

### Communication
- [ ] Support WhatsApp +243 opérationnel
- [ ] FAQ / aide mentionnent **zones SENGA RDC** (pas Kinshasa seul)
- [ ] Équipe ops briefée sur escalation

---

## 13. Contacts & références

| Ressource | Lien |
|-----------|------|
| Déploiement local / staging | [deployment.md](./deployment.md) |
| Intégration IA (cas d’usage) | [AI_INTEGRATION.md](./AI_INTEGRATION.md) |
| API | [api.md](./api.md) |
| CI/CD | [cicd.md](./cicd.md) |
| Tests E2E | [testing-e2e.md](./testing-e2e.md) |
| Support | support@mova.cd · WhatsApp +243 900 000 000 |

**Fuseau horaire opérations** : `Africa/Kinshasa` (WAT, UTC+1).

---

*Dernière mise à jour : juin 2026 — SENGA v1.4+ couverture nationale 32 zones.*

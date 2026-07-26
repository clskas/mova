# SENGA — Morning Brief (v1.5.0 — finalisé)

**Date:** 2026-06-15 · **Repo:** [clskas/mova](https://github.com/clskas/mova) · **Branch:** `main`

## Statut finalisé (juin 2026)

| Surface | Note | Statut |
|---------|------|--------|
| **Web PWA** | **9/10** | OTP + JWT, 11 services (taxi, colis, express, repas, déménagement, location, commissions, wallet, planifiées, covoiturage, historique), API réelle si gateway OK |
| **Mobile passager** | **9/10** | Tous modules branchés API, `checkHealth`, pas de mock si gateway up |
| **Mobile chauffeur** | **9/10** | Accept livraison → pickup → transit → livré, revenus, incidents, KYC |
| **Admin** | **9/10** | CRUD complet, RBAC 5 rôles staff, communes éditables, locations, abonnements |
| **Backend OTP** | **Prod-ready*** | Interface Twilio SMS + `MOCK_OTP` dev |
| **Paiements** | **Prod-ready*** | Wallet persisté, providers OM/M-Pesa/Airtel avec erreurs FR si clés manquantes |

\* *Production nationale = clés externes uniquement (Twilio, Orange Money, M-Pesa, Airtel). Voir checklist ci-dessous.*

## Quick start

```powershell
cd c:\Users\Administrator\Senga
docker compose up -d --build
npm run migrate:all
npm run seed:admin-demo

# Web PWA (port 3001)
cd web && npm install && npm run dev

# Admin (port 3002)
cd admin && npm install && npm run dev
```

| Client | URL | Auth dev |
|--------|-----|----------|
| API Gateway | http://localhost:3000 | — |
| Web PWA | http://localhost:3001 | OTP `123456` (`MOCK_OTP=true`) |
| Admin | http://localhost:3002/login | Staff `+243900000001`–`005` / OTP `123456` — voir [docs/RBAC_TESTING.md](docs/RBAC_TESTING.md) |
| Ride service (Docker) | http://localhost:3022 | — |

## Modules Web PWA

| Service | Route API | Flux |
|---------|-----------|------|
| Taxi | `/api/rides` | estimate → create |
| Colis | `/api/deliveries/parcel` | estimate → create |
| Express | `/api/express` | estimate → create → track |
| Repas | `/api/deliveries/food` | menu → commande |
| Déménagement | `/api/moving` | estimate → demande |
| Location | `/api/rental` | catalogue → estimate → booking |
| Commissions | `/api/errands` | estimate → create |
| Portefeuille | `/api/wallet` | solde + top-up persisté |
| Planifiées | `/api/rides/scheduled` | estimate → book |
| Covoiturage | `/api/carpool` | search / create / join |

## Admin CRUD

| Page | CRUD |
|------|------|
| `/utilisateurs` | Read + edit (tous rôles staff dans dropdown) |
| `/kyc` | Approve/Reject |
| `/litiges` | Resolve |
| `/restaurants` | List + Create + Edit + Delete |
| `/tarifs` | Edit pricing rules |
| `/abonnements` | Plans CRUD + abonnés |
| `/parametres` | Communes multi-ville + edit |
| `/locations` | Demandes location + statut |
| `/livraisons`, `/planifiees`, `/courses` | Read + filters + statut |

## Production checklist (clés externes seulement)

```env
MOCK_OTP=false
MOCK_PAYMENTS=false
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...   # ou TWILIO_VERIFY_SERVICE_SID
ORANGE_MONEY_API_KEY=...
MPESA_CONSUMER_KEY=...
AIRTEL_MONEY_CLIENT_ID=...
```

Détail : [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md)

## CI/CD (automatisé)

Push sur `main` : **CI** → **build images GHCR** → **backup DB + deploy Render** → **smoke production**.

```powershell
npm run backup:db:win      # sauvegarde locale
npm run migrate:all:docker # backup + migrations
npm run smoke:all          # smoke local
```

Secrets GitHub requis : `RENDER_API_KEY`, `RENDER_SERVICE_IDS`, `DATABASE_URL_*`, `SMOKE_API_URL`. Détail : [docs/cicd.md](docs/cicd.md).

## Tests

```powershell
.\scripts\verify-all.ps1
cd e2e && npm run test:e2e:admin
cd mobile && flutter test
```

## Mobile — appareil physique (LAN)

Machine dev LAN : **192.168.1.64** · Appareil test : **SM G981V** (`R3CN70C59KF`, `adb devices`).

> **Ne jamais** `flutter run` seul — flavors obligatoires (`passenger` / `driver` + `-t lib/main_*.dart`). Sinon : erreur Gradle *« failed to produce an .apk file »*.

| Variable | Appareil physique | Émulateur Android |
|----------|-------------------|-------------------|
| `API_URL` | `http://192.168.1.64:3000/api` | `http://10.0.2.2:3000/api` |
| `WS_URL` | `http://192.168.1.64:3000` | `http://10.0.2.2:3000` |

```powershell
# Scripts racine (recommandé)
.\scripts\run-mobile-passenger.ps1
.\scripts\run-mobile-driver.ps1

# Ou manuellement
cd mobile
flutter run --flavor passenger -t lib/main_passenger.dart `
  --dart-define=API_URL=http://192.168.1.64:3000/api `
  --dart-define=WS_URL=http://192.168.1.64:3000
```

APK debug local : `.\scripts\build-mobile-debug.ps1` (défaut LAN ci-dessus).

## Tester le mode hors ligne

```powershell
# 1. Lancer l'app passager sur appareil ou émulateur
cd mobile
flutter run --flavor passenger -t lib/main_passenger.dart `
  --dart-define=API_URL=http://192.168.1.64:3000/api `
  --dart-define=WS_URL=http://192.168.1.64:3000

# 2. Se connecter une fois en ligne pour remplir le cache (historique, wallet)

# 3. Couper le réseau (mode avion) OU arrêter la passerelle :
docker compose stop gateway

# 4. Vérifier :
#    - Bannière « Pas de réseau » ou « Serveur indisponible — mode hors ligne »
#    - Historique affiché avec « Dernière synchro : … »
#    - Création de course → message « Enregistré hors ligne… » + badge file de sync

# 5. Rétablir réseau + passerelle → la file se vide automatiquement
docker compose start gateway
```

## Mobile APK

```powershell
cd mobile
# ou : .\scripts\build-mobile-debug.ps1
flutter build apk --debug --flavor passenger -t lib/main_passenger.dart `
  --dart-define=API_URL=http://192.168.1.64:3000/api `
  --dart-define=WS_URL=http://192.168.1.64:3000
flutter build apk --debug --flavor driver -t lib/main_driver.dart `
  --dart-define=API_URL=http://192.168.1.64:3000/api `
  --dart-define=WS_URL=http://192.168.1.64:3000
```

---

*Dernière finalisation : juin 2026 — stack prête pour prod nationale dès configuration des APIs externes.*

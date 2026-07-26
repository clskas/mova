# Passer aux données réelles — SENGA RDC

Ce guide explique comment quitter le **mode développement** (OTP mock, paiements simulés, API locale) pour utiliser des **données et services réels** en staging ou production.

---

## 1. Ce qui est « mock » aujourd’hui (dev local)

| Composant | Variable / comportement | En dev |
|-----------|-------------------------|--------|
| OTP SMS | `MOCK_OTP=true` | Code fixe **`123456`** pour tous les numéros |
| Paiements Mobile Money | `MOCK_PAYMENTS=true` | Pas de vrai débit Orange / M-Pesa / Airtel |
| Upload photos | Stockage local `ride-service/uploads/` | Pas Cloudinary sauf config |
| Cartographie | Mapbox optionnel | Fallback coords / autocomplete stub |
| App mobile | `--dart-define=API_URL=...` | Pointe vers PC local ou LAN |

Fichiers de référence :

- `config/external-apis.env.example` → copier en `config/external-apis.env`
- `docker-compose.yml` → variables injectées aux services
- `docs/PRODUCTION_DEPLOYMENT.md` → déploiement complet

---

## 2. Checklist « données réelles »

### 2.1 Backend (`config/external-apis.env`)

```env
MOCK_OTP=false
MOCK_PAYMENTS=false

# Twilio (OTP réels)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+243...
# ou TWILIO_VERIFY_SERVICE_SID=...

# Mobile Money RDC
ORANGE_MONEY_API_KEY=...
ORANGE_MONEY_MERCHANT_ID=...
MPESA_CONSUMER_KEY=...
MPESA_CONSUMER_SECRET=...
AIRTEL_MONEY_CLIENT_ID=...
AIRTEL_MONEY_CLIENT_SECRET=...

# Stockage photos (recommandé prod)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Cartes
MAPBOX_ACCESS_TOKEN=...

JWT_SECRET=<secret fort, unique prod>
INTERNAL_API_KEY=<clé interne forte>
NODE_ENV=production
```

Puis redémarrer la stack :

```powershell
cd c:\Users\Administrator\Senga
docker compose down
docker compose up -d --build
```

Vérifier :

```powershell
Invoke-RestMethod http://localhost:3000/health
```

### 2.2 Admin (`admin/.env.local`)

```env
NEXT_PUBLIC_API_URL=https://api.votre-domaine.mova.cd
# ou staging : https://staging-api.mova.cd
```

```powershell
cd admin
npm run build
npm run start
```

### 2.3 App mobile passager / chauffeur

Compiler avec l’URL **HTTPS** de la passerelle (pas `127.0.0.1` en prod) :

```powershell
cd mobile
flutter build apk --flavor passenger -t lib/main_passenger.dart `
  --dart-define=API_URL=https://api.votre-domaine.mova.cd/api `
  --dart-define=WS_URL=https://api.votre-domaine.mova.cd

flutter build apk --flavor driver -t lib/main_driver.dart `
  --dart-define=API_URL=https://api.votre-domaine.mova.cd/api `
  --dart-define=WS_URL=https://api.votre-domaine.mova.cd
```

En **staging USB** (PC local + vrai OTP si Twilio configuré) :

```powershell
adb reverse tcp:3000 tcp:3000
flutter run --flavor passenger -t lib/main_passenger.dart `
  --dart-define=API_URL=http://127.0.0.1:3000/api `
  --dart-define=WS_URL=http://127.0.0.1:3000
```

> Ne pas activer `ApiClient.mock()` — réservé aux tests unitaires.

### 2.4 Base de données

- **Dev** : Postgres Docker (`54320`), seeds (`npm run seed:rides`, `seed:admin-demo`, etc.)
- **Prod** : bases managées (Neon, RDS, Supabase…) — une DB par service ou schémas séparés selon votre infra
- Appliquer les migrations Prisma par service avant mise en prod :

```powershell
cd services/ride-service
npx prisma migrate deploy
```

---

## 3. Processus métier — Déménagement

Le déménagement **n’est pas** une course taxi automatique. Flux actuel :

```
Passager                    Admin SENGA                    Chauffeur / équipe
   |                              |                                |
   |-- Demande + photos --------->|                                |
   |   (PENDING)                  |                                |
   |                              |-- Vérifie volume, prix -------->|
   |                              |-- Statut ASSIGNED ------------>| (équipe camion)
   |<-- Suivi app (poll) ---------|                                |
   |                              |-- IN_PROGRESS ---------------->|
   |                              |-- COMPLETED ------------------->|
   |<-- Paiement si activé -------|                                |
```

- Le passager **ne choisit pas** un chauffeur dans l’app : l’**administrateur** traite la demande dans **Admin → Déménagements** (`/demenagements`).
- L’admin change le statut : `PENDING` → `ASSIGNED` → `IN_PROGRESS` → `COMPLETED`.
- Le passager voit les mises à jour dans **Déménagement → Mes demandes**, **Suivi déménagement**, **Historique** (clic → modale détail).
- Le champ `driverId` existe en base pour une future assignation automatique ; aujourd’hui l’assignation est **manuelle côté admin**.

---

## 4. Processus — Réservation planifiée

```
Passager                 Admin SENGA              Chauffeur (futur / manuel)
   |                         |                         |
   |-- Réserve (SCHEDULED) ->|                         |
   |                         |-- CONFIRMED ----------->|
   |                         |-- IN_PROGRESS --------->| (jour J)
   |<-- Suivi + historique ---|                         |
   |                         |-- COMPLETED ------------>|
```

- Admin : **Planifiées** (`/planifiees`) — confirmer, mettre en cours, terminer.
- Passager : écran **Réservation planifiée** (liste + modale au clic), onglet **Historique → Réservations**.

---

## 5. Photos déménagement

- Upload : `POST /api/uploads/parcel-photo` (base64) → URL `/api/uploads/parcels/{uuid}.jpg`
- En prod : configurer **Cloudinary** et adapter `uploads.service.ts` si besoin (aujourd’hui stockage disque + URL relative).
- L’app affiche les photos via `MarketConfig.resolveMediaUrl()` (préfixe passerelle API).

---

## 6. Tests après bascule

1. OTP sur un **vrai numéro** (+243…) — plus de `123456` si `MOCK_OTP=false`
2. Créer une course, un déménagement, une réservation planifiée
3. Admin : changer les statuts, vérifier refresh passager (~12 s ou pull-to-refresh)
4. Historique passager : **clic sur une ligne** → modale détail + suivi
5. Paiement wallet avec petit montant test si `MOCK_PAYMENTS=false`

---

## 7. Dépannage

| Symptom | Cause probable | Action |
|---------|----------------|--------|
| OTP jamais reçu | Twilio non configuré | Vérifier SID/token, numéro expéditeur, crédits Twilio |
| Photos cassées | URL relative sans passerelle | Vérifier `API_URL` mobile + proxy `/api/uploads` |
| Statut passager figé | Pas de poll / cache | Ouvrir suivi ou historique ; admin a bien enregistré |
| Paiement échoue | Clés MM invalides | Logs `payment-service`, remettre `MOCK_PAYMENTS=true` en dev |

---

## 8. Références

- [GUIDE_TEST_APPS.md](./GUIDE_TEST_APPS.md) — scénarios de test locaux
- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) — déploiement Render / prod
- [external-apis.env.example](../config/external-apis.env.example) — liste complète des variables

# Guide de test manuel — Applications & microservices

Ce document décrit **comment tester MOVA** :
- **par application** (Admin, Passager, Chauffeur) ;
- **par microservice backend** (API, base de données, endpoints).

---

## Sommaire

| Partie | Contenu |
|--------|---------|
| [0. Préparation](#0-préparation-une-seule-fois-par-session) | Docker, OTP, comptes, IP LAN |
| [A. Applications](#partie-a--applications) | Admin → Passager → Chauffeur |
| [B. Microservices](#partie-b--microservices-backend) | Chaque service un par un |
| [C. Scénario E2E](#c-scénario-bout-en-bout) | Enchaînement des 3 apps |
| [C2. Suivi GPS & traces](#c2-suivi-gps--traces-de-route) | Carte admin + polyline mobile |
| [C3. RBAC admin par rôle](#c3-rbac-admin--test-par-niveau-daccès) | 5 comptes staff |
| [D. Dépannage](#d-dépannage-rapide) | Problèmes fréquents |

---

## 0. Préparation (une seule fois par session)

### Démarrer le backend

```powershell
cd c:\Users\Administrator\Mova
docker compose up -d --build
npm run migrate:all
npm run seed:admin-demo    # comptes staff + données démo
```

Vérifier que l’API répond :

```powershell
Invoke-RestMethod http://localhost:3000/health
```

### OTP en développement

| Paramètre | Valeur |
|-----------|--------|
| Fichier | `config/external-apis.env` |
| Variable | `MOCK_OTP=true` |
| Code OTP | **`123456`** (tous les comptes) |

### URLs et ports

| Client / entrée | URL |
|-----------------|-----|
| **API Gateway** (point d’entrée unique clients) | http://localhost:3000 |
| Admin Next.js (hors Docker) | http://localhost:3002 |
| Web PWA passager (hors Docker) | http://localhost:3001 |

**Ports Docker directs** (debug / health hors gateway) :

| Microservice | Port hôte | Health |
|--------------|-----------|--------|
| api-gateway | 3000 | http://localhost:3000/health |
| auth-service | 3011 | http://localhost:3011/health |
| ride-service | 3022 | http://localhost:3022/health |
| payment-service | 3003 | http://localhost:3003/health |
| driver-service | 3004 | http://localhost:3004/health |
| notification-service | 3005 | http://localhost:3005/health |
| admin-service | 3006 | http://localhost:3006/health |
| postgres | 54320 | — |
| redis | (interne) | — |

> En pratique, **mobile et admin appellent toujours la gateway** : `http://<IP>:3000/api/...`

### Helper PowerShell — obtenir un JWT

Réutilisez ce bloc dans les tests API :

```powershell
function Get-MovaToken {
  param([string]$Phone, [string]$Role = $null)
  Invoke-RestMethod -Uri "http://localhost:3000/api/auth/otp/request" -Method POST `
    -ContentType "application/json" -Body (@{ phone = $Phone } | ConvertTo-Json) | Out-Null
  $body = @{ phone = $Phone; code = "123456" }
  if ($Role) { $body.role = $Role }
  $auth = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/otp/verify" -Method POST `
    -ContentType "application/json" -Body ($body | ConvertTo-Json)
  if ($auth.accessToken) { return $auth.accessToken }
  return $auth.token
}

$adminToken  = Get-MovaToken "+243900000001"
$passToken   = Get-MovaToken "+243900000010"
$driverToken = Get-MovaToken "+243900000020" -Role "DRIVER"
```

### Appareils mobiles (réseau local)

Sur un **téléphone physique**, l’API doit pointer vers l’IP LAN du PC (pas `localhost`).

```powershell
# Trouver l’IP du PC (ex. 192.168.1.64)
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' }
```

| Appareil | Rôle | ID ADB typique |
|----------|------|----------------|
| Samsung SM G981V | Passager | `R3CN70C59KF` |
| V2 PRO | Chauffeur | `V220206V01014` |

Le PC et le téléphone doivent être sur le **même Wi‑Fi**.

```powershell
adb devices    # USB debugging activé
```

### Comptes de test

| Application | Téléphone | Rôle |
|-------------|-----------|------|
| **Admin** | `+243900000001` | SUPER_ADMIN |
| **Passager** | `+243900000010` | PASSENGER (Marie Kabila) |
| **Chauffeur** | `+243900000020` | DRIVER (Jean Mukendi) |

Autres comptes démo : passagers `+243900000011`–`012`, chauffeurs `+243900000021`–`023`.

### Comptes staff admin (RBAC)

| Téléphone | Rôle | Usage test |
|-----------|------|------------|
| `+243900000001` | SUPER_ADMIN | Accès complet + écriture partout |
| `+243900000002` | ADMIN | Idem SUPER_ADMIN (sans gestion des rôles système) |
| `+243900000003` | SUPPORT | Opérations : KYC, courses, livraisons, litiges |
| `+243900000004` | FINANCE | Tarifs, abonnements, portefeuille |
| `+243900000005` | CONTENT | Restaurants, communes, catalogue location |

Détail des menus et droits d’écriture : [RBAC_TESTING.md](./RBAC_TESTING.md) et [Manuel Admin — Niveaux d’accès](user-manual/admin.md#niveaux-daccès-par-rôle).

---

## Partie A — Applications

### Ordre recommandé

Testez dans cet ordre pour couvrir les dépendances entre apps :

1. **Admin** — valider KYC, consulter les données
2. **Passager** — commander, location véhicule, etc.
3. **Chauffeur** — accepter courses (nécessite KYC **APPROVED**)

---

## A1. Admin (back-office)

### Lancer l’admin

```powershell
cd c:\Users\Administrator\Mova\admin
Copy-Item .env.example .env.local -ErrorAction SilentlyContinue
npm install
npm run dev
```

Ouvrir : **http://localhost:3002/login**

### Connexion

1. Téléphone : `+243900000001`
2. Demander l’OTP → saisir **`123456`**
3. Vérifier le badge **Super Admin** et **CRUD actif** en haut à droite

### Checklist Admin

Cochez au fur et à mesure :

| # | Page | URL | Action à tester | Résultat attendu |
|---|------|-----|-----------------|------------------|
| 1 | Tableau de bord | `/` | Ouvrir la page | Métriques (utilisateurs, courses, etc.) |
| 2 | Utilisateurs | `/utilisateurs` | Rechercher `+243900000010` | Liste avec passager démo |
| 3 | Chauffeurs | `/chauffeurs` | Ouvrir **Détail** sur `+243900000020` | Profil, véhicules, statut KYC |
| 4 | KYC | `/kyc` | Approuver un chauffeur en attente ; vérifier badges OCR | Badge **APPROVED** ; champs OCR si documents uploadés |
| 4b | Chauffeurs | `/chauffeurs` | **Approuver KYC** ; **Valider type d’engin** (VIP/Confort…) | Statut KYC **APPROVED** ; `typeApprovalStatus` **APPROVED** |
| 5 | Courses | `/courses` | Ouvrir **Détail** d’une course active | Carte **Trace GPS** (D/A + polyline) ; refresh 10 s |
| 6 | Livraisons | `/livraisons` | Ouvrir **Détail** colis/repas/ERRAND actif | Trace GPS + assignation chauffeur (ERRAND) |
| 7 | Locations | `/locations` | Consulter demandes | Tableau réservations véhicules |
| 8 | Catalogue location | `/catalogue-location` | CRUD véhicule catalogue | Création / édition sans erreur de compilation |
| 9 | Déménagements | `/demenagements` | Ouvrir **Détail**, changer statut | Demande passager visible |
| 10 | Covoiturage | `/covoiturage` | Ouvrir **Détail**, changer statut | Trajet chauffeur/passager visible |
| 11 | Tarifs | `/tarifs` | Modifier un tarif Kinshasa ; section **Commissions plateforme** | Enregistrement OK |
| 12 | Restaurants | `/restaurants` | CRUD restaurant | Création / édition |
| 13 | Communes | `/parametres` | Ajouter / modifier une commune | Liste mise à jour |
| 14 | Déconnexion | Header | Cliquer **Déconnexion** | Retour login |

### Test rapide KYC (PowerShell)

Après connexion admin via l’UI, ou en API :

```powershell
# OTP admin
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/otp/request" -Method POST -ContentType "application/json" -Body '{"phone":"+243900000001"}'
$auth = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/otp/verify" -Method POST -ContentType "application/json" -Body '{"phone":"+243900000001","code":"123456"}'
$token = $auth.accessToken

# Approuver le chauffeur démo
$driverId = "d851b591-d561-4997-8a71-96fcc6ba8d3e"   # ou l’ID affiché dans /chauffeurs
Invoke-RestMethod -Uri "http://localhost:3000/api/admin/drivers/$driverId/kyc" -Method PATCH `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body '{"approved":true}'
```

> Si le chauffeur a été créé via OTP (pas le seed), son `userId` peut différer — utilisez l’ID affiché dans **Chauffeurs → Détail**.

---

## A2. Passager (app mobile Flutter)

### Lancer l’app

**Script recommandé** (IP LAN par défaut `192.168.1.64`) :

```powershell
cd c:\Users\Administrator\Mova
.\scripts\run-mobile-passenger.ps1
```

**Samsung branché en USB** (device explicite) :

```powershell
cd c:\Users\Administrator\Mova\mobile
flutter run --flavor passenger -t lib/main_passenger.dart -d R3CN70C59KF `
  --dart-define=API_URL=http://192.168.1.64:3000/api `
  --dart-define=WS_URL=http://192.168.1.64:3000
```

**Émulateur Android** (`10.0.2.2` = machine hôte) :

```powershell
.\scripts\run-mobile-passenger.ps1 -ApiUrl "http://10.0.2.2:3000/api" -WsUrl "http://10.0.2.2:3000"
```

### Connexion

1. Téléphone : `+243900000010`
2. OTP : **`123456`**

### Checklist Passager

| # | Écran | Action | Résultat attendu |
|---|-------|--------|------------------|
| 1 | Accueil | Faire défiler toutes les cartes services | Location, Déménagement, etc. visibles (pas coupées) |
| 2 | Commander une course | Saisir départ / arrivée, estimer | Prix en CDF affiché |
| 2b | Suivi course | Pendant course active | Carte : position chauffeur + **polyline** (trajet parcouru) |
| 3 | Location véhicule | Onglet **Rechercher** → filtres → **Rechercher** | Catalogue (ex. 5 véhicules Kinshasa), pas d’overflow |
| 4 | Location véhicule | Ouvrir un véhicule → réserver | Réservation ou devis OK |
| 5 | Mes locations | Onglet **Mes locations** | Liste (vide ou réservations) |
| 6 | Livraison / Food | Commander puis suivre | Carte avec trace GPS si livraison en cours |
| 7 | Portefeuille | Consulter solde | Affichage sans erreur |
| 8 | Aide | Ouvrir | Bouton **Déconnexion** visible |
| 9 | Déconnexion | Se déconnecter | Retour écran login |

### Si le catalogue location est vide

```powershell
Invoke-RestMethod "http://localhost:3000/api/rental/vehicles?city=Kinshasa"
# doit retourner data[] avec des véhicules
```

Vérifier Wi‑Fi, IP dans `--dart-define`, et que Docker tourne.

---

## A3. Chauffeur (app mobile Flutter)

> **Prérequis :** KYC **APPROVED** pour `+243900000020` (voir section Admin).

### Lancer l’app

```powershell
cd c:\Users\Administrator\Mova
.\scripts\run-mobile-driver.ps1
```

**V2 PRO en USB** :

```powershell
cd c:\Users\Administrator\Mova\mobile
flutter run --flavor driver -t lib/main_driver.dart -d V220206V01014 `
  --dart-define=API_URL=http://192.168.1.64:3000/api `
  --dart-define=WS_URL=http://192.168.1.64:3000
```

Si `adb devices` ne liste pas le V2 PRO : câble USB, **Débogage USB** activé, autoriser l’ordinateur sur l’écran du téléphone.

### Connexion

1. Téléphone : `+243900000020`
2. OTP : **`123456`**

### Checklist Chauffeur

| # | Écran | Action | Résultat attendu |
|---|-------|--------|------------------|
| 1 | Accueil (KYC pending) | Si non approuvé | Message / blocage KYC |
| 2 | Admin approuve KYC | Attendre ~5 s ou pull-to-refresh | Passage à écran opérationnel, snackbar possible |
| 3 | Disponibilité | Activer **En ligne** | Statut disponible |
| 4 | Course entrante | Depuis passager, commander une course | Offre reçue sur chauffeur |
| 5 | Accepter course | Accepter l’offre | Course en cours ; GPS envoyé (WebSocket + REST) |
| 5b | Livraison active | Accepter colis/repas | Position envoyée ~toutes les 12 s |
| 6 | Gains | Consulter gains | Montants affichés |
| 7 | KYC / documents | Upload permis, carte grise | Badges OCR si service configuré ; ne pas repasser en PENDING si déjà APPROVED |
| 8 | Type d’engin | Si véhicule VIP/Confort en attente | Blocage **canOperate** tant que admin n’a pas validé le type |
| 9 | Aide | Ouvrir | **Déconnexion** visible |
| 10 | Déconnexion | Se déconnecter | Retour login |

### Vérifier le statut KYC côté API

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/otp/request" -Method POST -ContentType "application/json" -Body '{"phone":"+243900000020"}'
$d = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/otp/verify" -Method POST -ContentType "application/json" -Body '{"phone":"+243900000020","code":"123456","role":"DRIVER"}'
$dt = $d.accessToken
(Invoke-RestMethod -Uri "http://localhost:3000/api/drivers/profile" -Headers @{ Authorization = "Bearer $dt" }).kycStatus
# attendu : APPROVED
```

---

## A4. Web PWA passager (optionnel)

```powershell
cd c:\Users\Administrator\Mova\web
npm install
npm run dev
```

Ouvrir **http://localhost:3001** — même compte passager `+243900000010` / OTP `123456`.

| # | Écran | Résultat attendu |
|---|-------|------------------|
| 1 | Accueil | Cartes services visibles |
| 2 | Location véhicule | Catalogue + estimation + réservation |
| 3 | Course taxi | Estimation tarif |

---

## Partie B — Microservices backend

Testez les services **dans cet ordre** (dépendances Docker) :

```
postgres + redis → driver → payment → auth → ride → notification → admin → api-gateway
```

### Vue d’ensemble

| Service | Base PostgreSQL | Préfixe gateway | Rôle |
|---------|-----------------|-----------------|------|
| **auth-service** | `mova_auth` | `/api/auth`, `/api/users` | OTP, JWT, profils utilisateurs |
| **driver-service** | `mova_drivers` | `/api/drivers`, `/api/incidents` | Profils chauffeurs, KYC, véhicules |
| **ride-service** | `mova_rides` | `/api/rides`, `/api/rental`, `/api/geo`, … | Courses, location, livraisons, geo |
| **payment-service** | `mova_payments` | `/api/wallet`, `/api/payments` | Portefeuille, paiements mock |
| **notification-service** | `mova_notifications` | `/api/notifications` | Notifications in-app |
| **admin-service** | *(proxy)* | `/api/admin` | Agrégation back-office |
| **api-gateway** | — | `/api/*`, `/health` | Routage vers les services |

Clé interne (appels `/internal/*`) : header `x-internal-api-key: mova-internal-dev`

---

### B0. Infrastructure — Postgres & Redis

```powershell
docker compose ps
docker exec mova-postgres-1 psql -U mova -d mova_auth -c "\l"
```

| # | Test | Commande | Attendu |
|---|------|----------|---------|
| 1 | Postgres up | `docker compose ps postgres` | `healthy` |
| 2 | Bases créées | `\l` dans psql | `mova_auth`, `mova_rides`, `mova_payments`, `mova_drivers`, `mova_notifications` |
| 3 | Redis up | `docker compose ps redis` | `running` |

Redémarrer uniquement Postgres (rare) :

```powershell
docker compose restart postgres
```

---

### B1. driver-service (port 3004)

**Dépend de :** postgres  
**Alimente :** app Chauffeur, admin Chauffeurs/KYC, matching courses

```powershell
Invoke-RestMethod http://localhost:3004/health
docker compose logs driver-service --tail 20
```

| # | Endpoint (via gateway) | Auth | Test |
|---|------------------------|------|------|
| 1 | `GET /api/drivers/profile` | JWT chauffeur | `kycStatus`, `vehicles[]` |
| 2 | `PATCH /api/drivers/availability` | JWT chauffeur | `{ "isAvailable": true }` |
| 3 | `POST /api/drivers/location` | JWT chauffeur | `{ "lat": -4.32, "lng": 15.32 }` |
| 4 | `GET /api/drivers/earnings` | JWT chauffeur | Totaux CDF |
| 5 | `GET /api/admin/drivers` | JWT admin | Liste `{ data, total }` |
| 6 | `PATCH /api/admin/drivers/:userId/kyc` | JWT admin | `{ "approved": true }` → **APPROVED** |

```powershell
$driverToken = Get-MovaToken "+243900000020" -Role "DRIVER"
Invoke-RestMethod http://localhost:3000/api/drivers/profile -Headers @{ Authorization = "Bearer $driverToken" }

$adminToken = Get-MovaToken "+243900000001"
# Remplacer USER_ID par l’ID affiché dans /chauffeurs
Invoke-RestMethod -Uri "http://localhost:3000/api/admin/drivers/USER_ID/kyc" -Method PATCH `
  -Headers @{ Authorization = "Bearer $adminToken" } -ContentType "application/json" `
  -Body '{"approved":true}'
```

**Internal (sans JWT)** :

```powershell
$h = @{ "x-internal-api-key" = "mova-internal-dev" }
Invoke-RestMethod http://localhost:3004/internal/drivers/count -Headers $h
Invoke-RestMethod http://localhost:3004/internal/kyc/pending -Headers $h
```

Redémarrer :

```powershell
docker compose up -d --build driver-service
```

---

### B2. payment-service (port 3003)

**Dépend de :** postgres, redis  
**Alimente :** portefeuille passager/chauffeur, paiements courses

```powershell
Invoke-RestMethod http://localhost:3003/health
```

| # | Endpoint | Auth | Test |
|---|----------|------|------|
| 1 | `GET /api/wallet` | JWT utilisateur | `balanceCdf` |
| 2 | `GET /api/wallet/transactions` | JWT | Historique |
| 3 | `POST /api/wallet/topup` | JWT | `{ "amountCdf": 5000, "provider": "MOCK" }` |

```powershell
$passToken = Get-MovaToken "+243900000010"
Invoke-RestMethod http://localhost:3000/api/wallet -Headers @{ Authorization = "Bearer $passToken" }
```

> Dev : `MOCK_PAYMENTS=true` dans Docker — pas de vrai Mobile Money.

```powershell
docker compose up -d --build payment-service
```

---

### B3. auth-service (port 3011)

**Dépend de :** postgres, redis, payment, driver  
**Alimente :** login toutes les apps

```powershell
Invoke-RestMethod http://localhost:3011/health
```

| # | Endpoint | Auth | Test |
|---|----------|------|------|
| 1 | `POST /api/auth/otp/request` | — | `{ "phone": "+243900000010" }` |
| 2 | `POST /api/auth/otp/verify` | — | `{ "phone", "code": "123456" }` → JWT |
| 3 | `GET /api/users/me` | JWT | Profil `firstName`, `role` |

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/auth/otp/request -Method POST `
  -ContentType "application/json" -Body '{"phone":"+243900000010"}'
$auth = Invoke-RestMethod -Uri http://localhost:3000/api/auth/otp/verify -Method POST `
  -ContentType "application/json" -Body '{"phone":"+243900000010","code":"123456"}'
Invoke-RestMethod http://localhost:3000/api/users/me -Headers @{ Authorization = "Bearer $($auth.accessToken)" }
```

**Seed comptes démo :**

```powershell
npm run seed:admin-demo    # staff + users + rides + drivers
```

```powershell
docker compose up -d --build auth-service
```

---

### B4. ride-service (port 3022)

**Dépend de :** postgres, redis  
**Alimente :** courses, location véhicule, livraisons, geo, déménagement, covoiturage

```powershell
Invoke-RestMethod http://localhost:3022/health
```

#### Geo (public)

```powershell
Invoke-RestMethod "http://localhost:3000/api/geo/autocomplete?q=gombe&city=Kinshasa"
Invoke-RestMethod "http://localhost:3000/api/geo/communes?city=Kinshasa"
Invoke-RestMethod "http://localhost:3000/api/geo/service-areas"
```

#### Location véhicule

| # | Endpoint | Auth | Test |
|---|----------|------|------|
| 1 | `GET /api/rental/vehicles?city=Kinshasa` | — | `data[]` ≥ 1 véhicule |
| 2 | `GET /api/rental/vehicles/:id` | — | Détail véhicule |
| 3 | `POST /api/rental/estimate` | JWT passager | Devis CDF |
| 4 | `POST /api/rental/bookings` | JWT passager | Création réservation |
| 5 | `GET /api/rental/bookings` | JWT passager | Mes locations |

```powershell
Invoke-RestMethod "http://localhost:3000/api/rental/vehicles?city=Kinshasa"
```

#### Courses taxi

| # | Endpoint | Auth | Test |
|---|----------|------|------|
| 1 | `POST /api/rides/estimate` | JWT passager | Prix estimé |
| 2 | `POST /api/rides` | JWT passager | Créer course |
| 3 | `GET /api/rides/offers` | JWT chauffeur | Offres SEARCHING |
| 4 | `GET /api/rides/history` | JWT | Historique |

#### Suivi GPS (traces de route)

| # | Endpoint | Auth | Test |
|---|----------|------|------|
| 1 | `POST /api/tracking/ride/:id/points` | JWT chauffeur | `{ "lat": -4.32, "lng": 15.32 }` → point enregistré |
| 2 | `GET /api/tracking/ride/:id/trace` | JWT passager/chauffeur/admin | `{ "points": [...], "summary": {...} }` |
| 3 | `GET /api/tracking/delivery/:id/trace` | JWT | Trace livraison colis/repas |
| 4 | `GET /api/tracking/errand/:id/trace` | JWT | Trace course & commissions |
| 5 | `GET /api/admin/tracking/:type/:id/trace` | JWT staff (SUPPORT+) | Proxy admin pour carte **GpsTraceMap** |

```powershell
$driverToken = Get-MovaToken "+243900000020" -Role "DRIVER"
# Remplacer RIDE_ID par une course en cours
Invoke-RestMethod -Uri "http://localhost:3000/api/tracking/ride/RIDE_ID/points" -Method POST `
  -Headers @{ Authorization = "Bearer $driverToken" } -ContentType "application/json" `
  -Body '{"lat":-4.3217,"lng":15.3125}'

$adminToken = Get-MovaToken "+243900000001"
Invoke-RestMethod "http://localhost:3000/api/admin/tracking/ride/RIDE_ID/trace" `
  -Headers @{ Authorization = "Bearer $adminToken" }
```

> Les points sont aussi enregistrés automatiquement via WebSocket (`driver:location`, `courier:location`). Déduplication : ~8 s ou ~8 m entre deux points identiques.

```powershell
$passToken = Get-MovaToken "+243900000010"
$body = @{
  pickupLat = -4.3217; pickupLng = 15.3125; pickupAddress = "Gombe"
  dropoffLat = -4.35; dropoffLng = 15.33; dropoffAddress = "Limete"
  vehicleType = "STANDARD"
} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/api/rides/estimate -Method POST `
  -Headers @{ Authorization = "Bearer $passToken" } -ContentType "application/json" -Body $body
```

**Seed catalogue location :**

```powershell
npm run seed:rides
```

```powershell
docker compose up -d --build ride-service
```

---

### B5. notification-service (port 3005)

**Dépend de :** postgres, redis  
**Alimente :** cloche notifications (mobile / web)

```powershell
Invoke-RestMethod http://localhost:3005/health
```

| # | Endpoint | Auth | Test |
|---|----------|------|------|
| 1 | `GET /api/notifications` | JWT | Liste (peut être vide) |
| 2 | `PATCH /api/notifications/:id/read` | JWT | Marquer lu |

```powershell
$passToken = Get-MovaToken "+243900000010"
Invoke-RestMethod http://localhost:3000/api/notifications -Headers @{ Authorization = "Bearer $passToken" }
```

```powershell
docker compose up -d --build notification-service
```

---

### B6. admin-service (port 3006)

**Dépend de :** auth, ride, driver, payment  
**Alimente :** UI Admin (`localhost:3002` → proxy vers gateway `/api/admin`)

```powershell
Invoke-RestMethod http://localhost:3006/health
```

| # | Endpoint | Auth | Test |
|---|----------|------|------|
| 1 | `GET /api/admin/metrics` | JWT SUPER_ADMIN | Compteurs dashboard |
| 2 | `GET /api/admin/users` | JWT admin | Liste utilisateurs |
| 3 | `GET /api/admin/drivers` | JWT admin | Liste chauffeurs |
| 4 | `GET /api/admin/kyc/pending` | JWT admin | Documents KYC |
| 5 | `GET /api/admin/rides` | JWT admin | Courses |
| 6 | `GET /api/admin/rental-inquiries` | JWT admin | Demandes location |

```powershell
$adminToken = Get-MovaToken "+243900000001"
Invoke-RestMethod http://localhost:3000/api/admin/metrics -Headers @{ Authorization = "Bearer $adminToken" }
```

```powershell
docker compose up -d --build admin-service
```

---

### B7. api-gateway (port 3000)

**Dépend de :** tous les services  
**Point d’entrée unique** pour mobile, web, admin

```powershell
Invoke-RestMethod http://localhost:3000/health | ConvertTo-Json -Depth 4
```

| # | Test | Attendu |
|---|------|---------|
| 1 | `status` global | `ok` ou `degraded` |
| 2 | Chaque entrée `services[]` | `status: ok` pour auth, ride, payment, driver, notification, admin |
| 3 | Routage | `/api/auth/*` → auth, `/api/rental/*` → ride, etc. |

Si un service est `down`, consulter ses logs puis le redémarrer isolément (sections B1–B6).

```powershell
docker compose up -d --build api-gateway
```

---

### B8. Matrice service ↔ application

| Fonctionnalité | Service principal | App qui l’utilise |
|----------------|-------------------|-------------------|
| Login OTP | auth-service | Admin, Passager, Chauffeur |
| KYC chauffeur | driver-service | Admin, Chauffeur |
| Course taxi | ride-service + driver-service | Passager, Chauffeur, Admin |
| **Trace GPS** | ride-service (`TrackingPoint`) | Passager, Chauffeur, Admin (`/courses`, `/livraisons`) |
| Location véhicule | ride-service | Passager, Admin (`/locations`) |
| Portefeuille | payment-service | Passager, Chauffeur |
| Tarifs / communes | ride-service (admin proxy) | Admin |
| Notifications | notification-service | Passager, Chauffeur |
| Tableau de bord | admin-service | Admin |

---

## C. Scénario bout-en-bout

Enchaînement type pour valider l’écosystème :

| Étape | App | Action |
|-------|-----|--------|
| 1 | Admin | Approuver KYC chauffeur `+243900000020` |
| 2 | Chauffeur | Connexion, passer **En ligne** |
| 3 | Passager | Commander une course Kinshasa → Kinshasa |
| 4 | Chauffeur | Accepter et terminer la course |
| 4b | Passager + Admin | Vérifier **polyline** (trajet) sur suivi passager et **Trace GPS** admin |
| 5 | Admin | Vérifier la course dans `/courses` |
| 6 | Passager | **Location véhicule** → réserver 2 jours |
| 7 | Admin | Vérifier dans `/locations` |

---

## C2. Suivi GPS & traces de route

Test dédié au module GPS (courses, livraisons, ERRAND).

| Étape | Qui | Action | Résultat attendu |
|-------|-----|--------|------------------|
| 1 | Admin | Approuver KYC + type d’engin chauffeur `+243900000020` | Chauffeur **canOperate** |
| 2 | Chauffeur | **En ligne**, accepter une course ou livraison | Mission active |
| 3 | Chauffeur | Se déplacer (ou simuler GPS) 30–60 s | Points enregistrés en base |
| 4 | Passager | Ouvrir écran de suivi | Marqueur chauffeur + **ligne bleue** (≥ 2 points) |
| 5 | Admin | `/courses` ou `/livraisons` → **Détail** | Carte **Trace GPS** : **D** départ, **A** arrivée, polyline |
| 6 | API | `GET /api/admin/tracking/ride/:id/trace` | Tableau `points[]` non vide |

**Comptes admin avec accès trace :** SUPER_ADMIN, ADMIN, SUPPORT (sections Courses / Livraisons). FINANCE et CONTENT n’ont pas ces menus.

**Types supportés :** `ride`, `delivery`, `errand` (`moving` prévu côté enum, pas encore branché mobile).

---

## C3. RBAC admin — test par niveau d’accès

Connectez-vous à http://localhost:3002/login avec chaque compte staff (OTP `123456`) et vérifiez :

| Rôle | Téléphone | Doit voir | Ne doit pas voir | Écriture typique |
|------|-----------|-----------|------------------|------------------|
| SUPER_ADMIN | `+243900000001` | Tout le menu | — | CRUD partout |
| ADMIN | `+243900000002` | Tout le menu | — | CRUD partout |
| SUPPORT | `+243900000003` | Utilisateurs, Chauffeurs, KYC, Courses, Livraisons, Litiges, Planifiées, Locations, Déménagements, Covoiturage | Dashboard, Tarifs, Restaurants, Portefeuille, Abonnements, Communes | KYC, litiges, statuts livraisons |
| FINANCE | `+243900000004` | Dashboard, Portefeuille, Tarifs, Abonnements | Utilisateurs, Courses, KYC… | Tarifs, abonnements, portefeuille |
| CONTENT | `+243900000005` | Restaurants, Tarifs, Communes, Locations, Catalogue location | Courses, KYC, Utilisateurs… | Restaurants, communes, catalogue |

Test rapide SUPPORT : ouvrir `/courses` → détail course active → carte GPS visible. Sur `/tarifs` : accès refusé (redirection).

Test rapide FINANCE : `/tarifs` → **Enregistrer** visible ; `/courses` → menu absent.

Régression automatisée : `e2e/tests/admin-rbac-roles.spec.ts` (voir [RBAC_TESTING.md](./RBAC_TESTING.md)).

---

## D. Dépannage rapide

| Problème | Piste |
|----------|--------|
| OTP invalide | `MOCK_OTP=true` + code `123456` |
| App mobile « hors ligne » | IP LAN correcte, même Wi‑Fi, port 3000 ouvert |
| KYC ne change pas | Admin → Chauffeurs → Détail → **Approuver KYC** ; rafraîchir la page |
| Compte suspendu | Connexion refusée ; API retourne 401 — repasser le statut **ACTIVE** dans Utilisateurs |
| Chauffeur bloqué KYC | Vérifier `kycStatus` via API (section A3) |
| **Connexion chauffeur refusée (403 suspendu)** | Admin → **Utilisateurs** → rechercher `+243900000020` → statut **ACTIVE** ; ou `npm run seed:admin-demo` |
| Erreur OTP sans message (chauffeur) | Mettre à jour l'app chauffeur (écran OTP affiche désormais l'erreur serveur) |
| Admin 3002 inaccessible | `cd admin && npm run dev` ; libérer le port 3002 |
| Gateway `degraded` | `GET /health` → identifier le service `down` → logs + restart ciblé |
| Port 3000 occupé | `docker compose ps` ; redémarrer la gateway |
| V2 PRO introuvable | `adb devices` ; rebrancher USB |
| Catalogue location vide | `GET /api/rental/vehicles?city=Kinshasa` ; `npm run seed:rides` |
| Trace GPS vide sur admin | Chauffeur en mission ? Attendre 8+ s entre points ; vérifier WebSocket `WS_URL` |
| Chauffeur bloqué malgré KYC OK | Vérifier **validation type d’engin** (VIP/Confort) dans `/chauffeurs` → Détail |
| ride-service seul en panne | `docker compose up -d --build ride-service` |

### Commandes utiles

```powershell
docker compose ps
docker compose logs driver-service --tail 30
.\scripts\verify-all.ps1 -SkipFlutter -SkipBuild
```

---

## E. Références

- [RBAC_TESTING.md](./RBAC_TESTING.md) — rôles admin détaillés
- [testing-e2e.md](./testing-e2e.md) — tests Playwright / Appium automatisés
- [README.md](../README.md) — installation complète du monorepo

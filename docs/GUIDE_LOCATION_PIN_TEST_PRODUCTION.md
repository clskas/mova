# Location véhicule — PIN espèces, tests réels & production

Guide opérationnel SENGA RDC : confirmation du code PIN par le partenaire loueur, scénarios de test bout-en-bout, et checklist pour un lancement production.

---

## 1. Rôles dans le flux location

| Acteur | Application | Rôle |
|--------|-------------|------|
| **Passager** | App mobile Passager | Réserve, reçoit le véhicule, paie (wallet / mobile money / **espèces**) |
| **Partenaire loueur** | Portail partenaire `http://localhost:3008` | Gère réservations sur **ses** véhicules, remise / retour |
| **Chauffeur SENGA** (optionnel) | App mobile Chauffeur | Si logistique SENGA : remise / récupération du véhicule |
| **Admin** | `http://localhost:3002` | Catalogue, validation véhicules, supervision |

> Le **PIN espèces** sert uniquement au paiement **CASH** après retour du véhicule. Ce n’est **pas** le même bouton que « Confirmer disponibilité » sur le portail partenaire.

---

## 2. Cycle de vie d’une réservation

```
PENDING → CONTACTED → CONFIRMED → IN_PROGRESS → RETURNED → PAID
                                              ↘ CLOSED (annulation)
```

| Statut | Signification | Qui agit |
|--------|---------------|----------|
| `PENDING` | Demande envoyée | Passager |
| `CONTACTED` | Partenaire a pris en charge | Partenaire |
| `CONFIRMED` | Disponibilité confirmée | Partenaire |
| `IN_PROGRESS` | Véhicule remis au passager | Partenaire (ou chauffeur SENGA) |
| `RETURNED` | Véhicule rendu — **paiement possible** | Partenaire (ou chauffeur SENGA) |
| `PAID` | Paiement confirmé (espèces, wallet ou mobile money) | Système après paiement |
| `CLOSED` | Annulée / refusée | Partenaire ou passager |

À la transition vers `RETURNED`, le système génère un **`completionPin`** (code à 4 chiffres) si absent.

---

## 3. Comment confirmer le code PIN côté partenaire

### 3.1 Principe

1. Le partenaire marque **« Véhicule rendu »** sur le portail → statut `RETURNED`.
2. Le passager ouvre **Mes locations** → **Payer la location** → choisit **Espèces**.
3. Le passager voit le **code PIN** et le communique au partenaire (oralement ou par SMS).
4. Le partenaire **confirme la réception des espèces** en saisissant ce PIN.
5. Le paiement passe à `COMPLETED`, la location passe à **`PAID`**, le passager peut ouvrir son **reçu SENGA**.

### 3.2 Qui peut confirmer le PIN ?

L’API accepte le JWT de l’utilisateur identifié comme « receveur » du paiement espèces :

- le **propriétaire du véhicule** (`ownerUserId` du partenaire), **ou**
- le **chauffeur SENGA** assigné à la mission (`driverId`), si logistique SENGA.

### 3.3 Portail partenaire (aujourd’hui)

Sur **http://localhost:3008** → **Réservations** :

| Bouton | Action | Statut résultant |
|--------|--------|------------------|
| Prendre en charge | `acknowledge` | `CONTACTED` |
| Confirmer disponibilité | `confirm` | `CONFIRMED` |
| Remise effectuée → En cours | `start` | `IN_PROGRESS` |
| **Véhicule rendu** | `return` | `RETURNED` (+ génération PIN) |

**Important :** le portail partenaire ne propose pas encore de champ « Saisir le PIN espèces ». La confirmation PIN se fait aujourd’hui via **l’API** (section 3.4) ou, si un chauffeur SENGA est assigné, via l’app Chauffeur (écran mission location — confirmation PIN à venir côté mobile).

### 3.4 Confirmation PIN via API (méthode actuelle pour le partenaire)

**Endpoint :**

```http
POST /api/payments/services/RENTAL/{bookingId}/cash/confirm
Authorization: Bearer {token_partenaire}
Content-Type: application/json

{ "pin": "1234" }
```

**Prérequis :**

- Réservation en statut `RETURNED`
- Paiement espèces initié par le passager (`POST /api/payments/services/RENTAL/{bookingId}` avec `method: "CASH"`)
- PIN identique au `completionPin` de la réservation

**Exemple PowerShell (test local) :**

```powershell
function Get-MovaToken {
  param([string]$Phone, [string]$Role = $null)
  Invoke-RestMethod -Uri "http://localhost:3000/api/auth/otp/request" -Method POST `
    -ContentType "application/json" -Body (@{ phone = $Phone } | ConvertTo-Json) | Out-Null
  $body = @{ phone = $Phone; code = "123456" }
  if ($Role) { $body.role = $Role }
  $auth = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/otp/verify" -Method POST `
    -ContentType "application/json" -Body ($body | ConvertTo-Json)
  return $auth.accessToken ?? $auth.token
}

$partnerToken = Get-MovaToken "+243900000031"
$bookingId    = "<UUID-de-la-reservation>"
$pin          = "1234"   # code affiché au passager

Invoke-RestMethod `
  -Uri "http://localhost:3000/api/payments/services/RENTAL/$bookingId/cash/confirm" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $partnerToken" } `
  -ContentType "application/json" `
  -Body (@{ pin = $pin } | ConvertTo-Json)
```

**Réponse attendue :**

```json
{ "success": true, "message": "Paiement espèces confirmé" }
```

**Vérifications :**

```powershell
# Statut paiement
Invoke-RestMethod "http://localhost:3000/api/payments/services/RENTAL/$bookingId/status" `
  -Headers @{ Authorization = "Bearer $partnerToken" }

# Détail réservation (statut PAID)
Invoke-RestMethod "http://localhost:3000/api/rental/bookings/$bookingId" `
  -Headers @{ Authorization = "Bearer $(Get-MovaToken '+243900000012')" }
```

### 3.5 Autres modes de paiement (sans PIN)

| Mode | Confirmation partenaire |
|------|-------------------------|
| **Portefeuille SENGA** | Automatique — pas de PIN |
| **Orange Money / M-Pesa / Airtel** | Automatique après callback opérateur |
| **Espèces** | PIN obligatoire côté partenaire ou chauffeur assigné |

---

## 4. Scénario de test réel — bout en bout (local)

### 4.1 Prérequis infrastructure

```powershell
cd c:\Users\Administrator\Senga

# 1. Stack backend
docker compose up -d --build
curl http://localhost:3000/health   # status: ok

# 2. Seeds (si base vide)
npm run seed:auth
npm run seed:admin-demo
# Catalogue location : véhicules Kinshasa dans ride-service

# 3. Fronts (terminaux séparés)
.\scripts\run-rental-partner.ps1          # http://localhost:3008
cd admin && npm run dev                   # http://localhost:3002
```

**Fichiers de config :**

| Fichier | Usage |
|---------|-------|
| `config/external-apis.env` | `MOCK_OTP=true`, `MOCK_PAYMENTS=true` en dev |
| `rental-partner/.env.local` | `NEXT_PUBLIC_API_URL=http://localhost:3000` |
| `admin/.env.local` | `NEXT_PUBLIC_API_URL=http://localhost:3000` |

**Ports à ne pas confondre :**

| Service | Port |
|---------|------|
| API Gateway SENGA | **3000** |
| Web passager | 3001 |
| Admin | 3002 |
| Portail partenaire location | **3008** |

> Ne pas lancer Reserva ou autre app sur le port **3000** — l’app mobile affichera « Serveur indisponible ».

### 4.2 Comptes de test

| Rôle | Téléphone | OTP (dev) | Où se connecter |
|------|-----------|-----------|-----------------|
| Passager | `+243900000012` (Grace Lumumba) | `123456` | App Passager |
| Partenaire location | `+243900000031` | `123456` | Portail 3008 |
| Chauffeur (si logistique SENGA) | `+243900000023` (KYC approuvé) | `123456` | App Chauffeur |
| Admin | `+243900000001` | `123456` | Admin 3002 |

### 4.3 Étapes du test espèces location

| # | Acteur | Action | Résultat attendu |
|---|--------|--------|------------------|
| 1 | Admin | `/catalogue-location` — véhicule **APPROVED** + actif | Visible dans l’app passager |
| 2 | Passager | Location → Kinshasa → réserver 2 jours | Statut `PENDING` |
| 3 | Partenaire | Portail → Réservations → Prendre en charge → Confirmer | `CONFIRMED` |
| 4 | Partenaire | Remise effectuée → En cours | `IN_PROGRESS` |
| 5 | Partenaire | Véhicule rendu | `RETURNED`, `completionPin` généré |
| 6 | Passager | Détail réservation → **Payer** → **Espèces** | PIN affiché, paiement `PENDING` |
| 7 | Partenaire | API `cash/confirm` avec le PIN (§ 3.4) | Paiement `COMPLETED`, statut `PAID` |
| 8 | Passager | **Voir le reçu** | PDF / partage OK, montant cohérent |
| 9 | Partenaire | Télécharger reçu partenaire (portail) | Facturation partenaire séparée du reçu passager |

### 4.4 Test mobile (téléphone USB)

```powershell
# Samsung passager
adb -s R3CN70C59KF reverse tcp:3000 tcp:3000
.\scripts\run-mobile-passenger.ps1 -UsbReverse -Device R3CN70C59KF

# V2 PRO chauffeur (si logistique SENGA)
adb -s V220206V01014 reverse tcp:3000 tcp:3000
.\scripts\run-mobile-driver.ps1 -UsbReverse -Device V220206V01014
```

Sans USB : même Wi‑Fi, scripts sans `-UsbReverse` (API = IP LAN du PC).

### 4.5 Wallet mock (tests sans mobile money réel)

Avec `MOCK_PAYMENTS=true` :

- Recharge test dans l’app **Wallet** (+50 000 FC)
- Compte passager démo `+243900000010` crédité automatiquement (250 000 FC)

### 4.6 Codes promo test

- `MOVA10` — −10 % sur location (et autres services)
- Validation : `POST /api/promo/validate` avec `{ "code": "MOVA10" }`

### 4.7 Commandes de diagnostic

```powershell
# Santé globale
.\scripts\smoke-gateway.ps1

# Catalogue location
Invoke-RestMethod "http://localhost:3000/api/rental/vehicles?city=Kinshasa"

# Preview paiement (PIN + montant)
$token = Get-MovaToken "+243900000012"
Invoke-RestMethod "http://localhost:3000/api/payments/services/RENTAL/$bookingId/info" `
  -Headers @{ Authorization = "Bearer $token" }

# Conteneurs
docker compose ps
docker compose logs ride-service --tail 30
docker compose logs payment-service --tail 30
```

---

## 5. Checklist production

### 5.1 Infrastructure

- [ ] Déploiement Render (ou équivalent) via `render.yaml`
- [ ] PostgreSQL ×5 + Redis provisionnés, sauvegardes activées
- [ ] Domaine API : `https://api.mova.cd` (gateway unique)
- [ ] HTTPS obligatoire sur tous les fronts
- [ ] `curl https://api.mova.cd/health` → `status: ok`, bases `connected`

Référence détaillée : [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)

### 5.2 Variables d’environnement production

Copier `config/external-apis.env.example` → secrets Render / vault.

| Variable | Valeur production |
|----------|-------------------|
| `MOCK_OTP` | **`false`** |
| `MOCK_PAYMENTS` | **`false`** |
| `MOCK_SMS` | **`false`** |
| `JWT_SECRET` | ≥ 32 caractères, **identique** sur tous les services |
| `INTERNAL_API_KEY` | Clé forte, identique inter-services |
| `CORS_ORIGIN` | `https://app.mova.cd,https://admin.mova.cd,https://location.mova.cd` |

**SMS / OTP (au choix) :**

| Provider | Variables |
|----------|-----------|
| Africa's Talking (recommandé RDC) | `AFRICAS_TALKING_USERNAME`, `AFRICAS_TALKING_API_KEY`, `AFRICAS_TALKING_SMS_SENDER` |
| Twilio (legacy) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |

**Mobile Money :**

| Provider | Variables |
|----------|-----------|
| Africa's Talking MM | `MOBILE_MONEY_GATEWAY=africastalking`, `AFRICAS_TALKING_MM_CALLBACK_URL` |
| Legacy opérateurs | `ORANGE_MONEY_*`, `MPESA_*`, `AIRTEL_MONEY_*` |

**Autres :**

| Variable | Usage |
|----------|-------|
| `FCM_SERVER_KEY` | Push notifications passager / chauffeur |
| `MAPBOX_ACCESS_TOKEN` | Autocomplétion adresses nationale RDC (fortement recommandé en prod) |
| `OSRM_BASE_URL` / `NOMINATIM_BASE_URL` | Routage / géocodage de secours (OSM public : couverture RDC incomplète hors grandes villes) |

> **Autocomplete RDC :** ride-service utilise Mapbox (si token) puis Nominatim/Photon avec `country=cd` et bbox nationale (−13.6…5.6, 12…31.5). Sans Mapbox, certains territoires / quartiers peuvent manquer dans OSM. OSRM a un repli Haversine si aucune route n’est trouvée.
| `CLOUDINARY_*` | Photos véhicules partenaires |

### 5.3 URLs clients production

| Client | Variable | Exemple |
|--------|----------|---------|
| App mobile | `API_URL` / `WS_URL` (build release) | `https://api.mova.cd/api` |
| Web passager | `NEXT_PUBLIC_API_URL` | `https://api.mova.cd` |
| Admin | `NEXT_PUBLIC_API_URL` | `https://api.mova.cd` |
| Portail partenaire | `NEXT_PUBLIC_API_URL` | `https://api.mova.cd` |

Build mobile release :

```powershell
.\scripts\build-mobile-release.ps1 -ApiUrl "https://api.mova.cd/api" -WsUrl "https://api.mova.cd"
```

### 5.4 Migrations base de données

Après déploiement ride-service / payment-service :

```bash
docker compose exec ride-service npx prisma migrate deploy
docker compose exec payment-service npx prisma migrate deploy
```

Migration PIN location : `20250705140000_rental_cash_pin_paid` (statut `PAID` + colonne `completionPin`).

### 5.5 Comptes & onboarding production

| Étape | Responsable | Action |
|-------|-------------|--------|
| Créer partenaire | Admin | Utilisateurs → rôle **RENTAL_PARTNER** |
| Valider véhicules | Admin CONTENT+ | Catalogue location → Approuver |
| KYC chauffeurs logistique | Admin SUPPORT+ | Chauffeurs → Approuver KYC |
| Publier apps | Ops | Play Store + App Store (flavors passenger / driver) |
| Former partenaires | Commercial | Flux réservation + confirmation PIN espèces |

### 5.6 Tests pré-lancement production

| # | Test | Critère succès |
|---|------|----------------|
| 1 | OTP réel (+243) | SMS reçu, code ≠ 123456 |
| 2 | Paiement Orange Money test | Callback → `COMPLETED` |
| 3 | Location complète espèces | `RETURNED` → PIN → `PAID` → reçu passager |
| 4 | Portefeuille | Top-up réel + débit course/location |
| 5 | Portail partenaire prod | Login OTP, réservations, PDF partenaire |
| 6 | Charge gateway | `/health` < 500 ms, pas d’erreur 5xx sous charge légère |

### 5.7 Surveillance & incidents

| Symptôme | Cause fréquente | Action |
|----------|-----------------|--------|
| « Serveur indisponible » mobile | Gateway down ou mauvais port (3000 occupé) | `docker compose ps`, libérer port 3000 |
| PIN espèces indisponible | Statut ≠ `RETURNED` | Partenaire : marquer « Véhicule rendu » |
| PIN incorrect | Mauvais code saisi | Passager : rouvrir écran paiement |
| Paiement bloqué PENDING | PIN non confirmé | Partenaire : `cash/confirm` |
| Reçu inaccessible | Statut ≠ `PAID` | Confirmer paiement d’abord |

---

## 6. Récapitulatif API location (référence rapide)

| Méthode | Route | JWT | Description |
|---------|-------|-----|-------------|
| GET | `/api/rental/vehicles?city=Kinshasa` | — | Catalogue |
| POST | `/api/rental/bookings` | Passager | Créer réservation |
| GET | `/api/rental/bookings/:id` | Passager | Détail + PIN si `RETURNED` |
| PATCH | `/api/rental-partner/bookings/:id` | Partenaire | `confirm`, `start`, `return`… |
| GET | `/api/payments/services/RENTAL/:id/info` | Passager | Montant + `cashPin` |
| POST | `/api/payments/services/RENTAL/:id` | Passager | Initier paiement |
| POST | `/api/payments/services/RENTAL/:id/cash/confirm` | **Partenaire ou chauffeur** | **Confirmer PIN espèces** |
| GET | `/api/billing/receipts/RENTAL/:id` | Passager | Reçu JSON |
| GET | `/api/billing/receipts/RENTAL/:id/pdf` | Passager | Reçu PDF |
| GET | `/api/rental-partner/bookings/:id/receipt/pdf` | Partenaire | Reçu partenaire |

---

## 7. Documents connexes

- [GUIDE_TEST_APPS.md](./GUIDE_TEST_APPS.md) — tests globaux écosystème SENGA
- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) — déploiement national RDC
- [rental-partner/README.md](../rental-partner/README.md) — portail partenaire
- [CAHIER_DES_CHARGES_V2.md](./CAHIER_DES_CHARGES_V2.md) — espèces multi-services (CASH-03)

---

*Dernière mise à jour : juillet 2026 — SENGA RDC v1.4+*

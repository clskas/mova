# MOVA — Propriété des données et emplacements CRUD

Ce document clarifie **qui crée** chaque entité, **qui la gère** côté admin, et **où se trouvent les endpoints CRUD** (gateway `http://localhost:3000`).

## Légende

| Colonne | Signification |
|---------|---------------|
| **Created by** | Acteur qui crée l'enregistrement en conditions normales |
| **Managed by Admin** | Opérations réservées ou supervisées par l'équipe MOVA |
| **CRUD location** | Service + routes API |

---

## Tableau de propriété

| Entity | Created by | Managed by Admin | CRUD location |
|--------|------------|------------------|---------------|
| **Users** | Self-registration via OTP (`auth-service`) | Lecture liste, rôle (futur) | **User:** `POST /api/auth/otp/*`, `GET /api/users/me` · **Admin:** `GET /api/admin/users` → `auth-service` `/internal/users` |
| **Drivers** | User devient DRIVER + profil auto (`driver-service`) | Supervision KYC, disponibilité | **User/Driver:** `POST /api/auth/otp/verify` (role=DRIVER), `PATCH /api/drivers/*` · **Admin:** via KYC + métriques |
| **KYC** | Driver upload (`driver-service`) | Approbation / rejet | **Driver:** `POST /api/drivers/kyc` · **Admin:** `GET /api/admin/kyc/pending`, `POST /api/admin/kyc/:id/review` |
| **Rides (taxi)** | Passenger (`ride-service`) | Stats, litiges | **User:** `POST /api/rides`, `GET /api/rides`, `POST /api/rides/estimate` · **Admin:** métriques via `/internal/rides/stats` |
| **Scheduled rides** | Passenger | Vue opérations | **User:** `POST /api/rides/scheduled`, `POST /api/rides/scheduled/estimate`, `GET /api/rides/scheduled` · **Admin:** `GET /api/admin/scheduled-rides` |
| **Deliveries (parcel/food)** | Passenger | Vue livraisons actives | **User:** `POST /api/deliveries/parcel/*`, `POST /api/deliveries/food/*`, `GET /api/deliveries/history` · **Admin:** `GET /api/admin/deliveries` |
| **Errands (courses & commissions)** | Passenger | (via commandes) | **User (mobile):** `POST /api/deliveries/errand/estimate`, `POST /api/deliveries/errand`, `GET /api/deliveries/errand/history` · **API canonique:** `POST /api/errands/*` · **Admin:** inclus dans métriques livraisons |
| **Restaurants** | Seed / Admin | CRUD complet | **User:** `GET /api/deliveries/restaurants` · **Admin:** `GET/POST /api/admin/restaurants`, `POST /api/admin/restaurants/:id` → `ride-service` `/internal/restaurants` |
| **Pricing rules** | Seed / Admin | Tarifs par type véhicule | **User:** utilisé implicitement dans estimates · **Admin:** `GET /api/admin/pricing-rules`, `POST /api/admin/pricing-rules/:vehicleType` |
| **Communes** | Seed (`ride-service`) | Référentiel géo | **User:** `GET /api/geo/communes` · **Admin:** seed uniquement (pas de CRUD UI) |
| **Incidents / litiges** | User ou Driver | Résolution | **User:** `POST /api/incidents` · **Admin:** `GET /api/admin/incidents`, `POST /api/admin/incidents/:id/resolve` |
| **Carpool** | Driver / Passenger | — | **User:** `GET/POST /api/carpool/rides`, `POST /api/carpool/estimate`, `POST /api/carpool/search` · **Canonique:** `/api/carpool` |
| **Wallet / Payments** | Auto à l'inscription + transactions user | — | **User:** `GET /api/wallet`, `POST /api/payments/*` · **Admin:** revenus agrégés dans métriques |

---

## Flux admin (authentification)

1. Créer l'utilisateur admin : `scripts/seed-admin.ps1` (téléphone `+243900000001`, rôle `ADMIN`)
2. Se connecter sur **admin/** → `/login` : OTP `123456` (dev, `MOCK_OTP=true`) ou coller un JWT
3. Toutes les requêtes `/api/admin/*` envoient `Authorization: Bearer <JWT>` — le `admin-service` n'accepte que `role=ADMIN`

---

## Notes d'implémentation

- **Gateway** proxy : `/api/errands`, `/api/deliveries`, `/api/carpool`, `/api/rides` → `ride-service`
- **Routes mobile legacy** : le mobile appelle `/api/deliveries/errand/*` ; le backend expose aussi `/api/errands/*` (contrat documenté)
- **Données sensibles** : JWT, OTP, clés internes — jamais commitées ; utiliser `.env` / variables Docker
- **Seed ride-service** : tarifs, communes et restaurants créés au démarrage (`SeedService`)

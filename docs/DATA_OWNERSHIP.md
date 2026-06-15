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
| **Users** | Self-registration via OTP (`auth-service`) | Liste, détail, rôle, statut, suspension | **User:** `POST /api/auth/otp/*`, `GET /api/users/me` · **Admin:** `GET/PATCH /api/admin/users`, `GET/PATCH /api/admin/users/:id` → `auth-service` `/internal/users` |
| **Drivers** | User devient DRIVER + profil auto (`driver-service`) | Liste, détail, suspension/activation | **User/Driver:** `POST /api/auth/otp/verify` (role=DRIVER), `PATCH /api/drivers/*` · **Admin:** `GET /api/admin/drivers`, `GET /api/admin/drivers/:userId`, `PATCH /api/admin/drivers/:userId/status` |
| **KYC** | Driver upload (`driver-service`) | Approbation / rejet + aperçu document | **Driver:** `POST /api/drivers/kyc` · **Admin:** `GET /api/admin/kyc/pending`, `POST /api/admin/kyc/:id/review` |
| **Rides (taxi)** | Passenger (`ride-service`) | Liste, détail, annulation admin | **User:** `POST /api/rides`, `GET /api/rides`, `POST /api/rides/estimate` · **Admin:** `GET /api/admin/rides`, `GET /api/admin/rides/:id`, `POST /api/admin/rides/:id/cancel` |
| **Scheduled rides** | Passenger | Liste, annulation admin | **User:** `POST /api/rides/scheduled`, … · **Admin:** `GET /api/admin/scheduled-rides`, `POST /api/admin/scheduled-rides/:id/cancel` |
| **Deliveries (parcel/food/express/errand)** | Passenger | Liste, détail, mise à jour statut | **User:** `POST /api/deliveries/*` · **Admin:** `GET /api/admin/deliveries`, `GET /api/admin/deliveries/:id`, `PATCH /api/admin/deliveries/:id/status` |
| **Errands (courses & commissions)** | Passenger | (via livraisons) | **User (mobile):** `POST /api/deliveries/errand/*` · **Admin:** filtre type `ERRAND` dans `/api/admin/deliveries` |
| **Restaurants** | Seed / Admin | CRUD complet (UI admin) | **User:** `GET /api/deliveries/restaurants` · **Admin:** `GET/POST /api/admin/restaurants`, `PATCH /api/admin/restaurants/:id` |
| **Pricing rules** | Seed / Admin (Finance, Contenu) | Tarifs courses taxi + livraisons | **Admin:** `GET/PATCH /api/admin/pricing-rules?city=`, `GET/PATCH /api/admin/delivery-pricing-rules` → `ride-service` (`pricing_rules`, `service_surcharges`) · **Propriétaire:** Finance (édition), Contenu (consultation) |
| **Subscription plans** | Admin (Finance) | Plans MOVA Plus, abonnés | **Admin:** `GET/POST/PATCH /api/admin/subscription-plans`, `GET /api/admin/subscriptions` (backend à venir — mock UI) · **Propriétaire:** Finance |
| **Communes** | Seed (`ride-service`) | Lecture seule (Paramètres admin) | **User:** `GET /api/geo/communes` · **Admin:** même endpoint (pas de CRUD UI) |
| **Incidents / litiges** | User ou Driver | Résolution | **User:** `POST /api/incidents` · **Admin:** `GET /api/admin/incidents`, `POST /api/admin/incidents/:id/resolve` |
| **Carpool** | Driver / Passenger | — | **User:** `GET/POST /api/carpool/rides`, `POST /api/carpool/estimate`, `POST /api/carpool/search` · **Canonique:** `/api/carpool` |
| **Wallet / Payments** | Auto à l'inscription + transactions user | — | **User:** `GET /api/wallet`, `POST /api/payments/*` · **Admin:** revenus agrégés dans métriques |

---

## Flux admin (authentification & RBAC)

1. Créer l'utilisateur admin : `scripts/seed-admin.ps1` (téléphone `+243900000001`, rôle `ADMIN`)
2. Se connecter sur **admin/** → `/login` : OTP `123456` (dev, `MOCK_OTP=true`) ou coller un JWT
3. Toutes les requêtes `/api/admin/*` envoient `Authorization: Bearer <JWT>`
4. **RBAC console admin** (frontend) — rôle lu depuis JWT ou `GET /api/users/me` :
   - `SUPER_ADMIN` / `ADMIN` : accès complet
   - `SUPPORT` : utilisateurs/chauffeurs (lecture), KYC, litiges, courses/livraisons (lecture)
   - `FINANCE` : métriques, portefeuille, tarifs, abonnements
   - `CONTENT` : restaurants, tarifs (lecture/édition), communes
5. Menu latéral et gardes de route masquent/redirigent les sections non autorisées

---

## Notes d'implémentation

- **Gateway** proxy : `/api/errands`, `/api/deliveries`, `/api/carpool`, `/api/rides` → `ride-service`
- **Routes mobile legacy** : le mobile appelle `/api/deliveries/errand/*` ; le backend expose aussi `/api/errands/*` (contrat documenté)
- **Données sensibles** : JWT, OTP, clés internes — jamais commitées ; utiliser `.env` / variables Docker
- **Seed ride-service** : tarifs, communes et restaurants créés au démarrage (`SeedService`)

## Propriété tarifs vs abonnements

| Domaine | Équipe responsable | Données | Endpoints admin |
|---------|-------------------|---------|-----------------|
| **Tarifs courses & livraisons** | Finance (édition), Contenu (consultation) | `pricing_rules` (par ville), `service_surcharges` (PARCEL/FOOD/EXPRESS) | `/api/admin/pricing-rules?city=`, `/api/admin/delivery-pricing-rules` |
| **Abonnements MOVA Plus** | Finance | Plans, prix mensuel CDF, avantages, abonnés actifs | `/api/admin/subscription-plans`, `/api/admin/subscriptions` |

Les tarifs impactent directement les estimates (`ride-service`). Les abonnements sont un produit commercial distinct géré par Finance ; l'UI admin existe avec mock tant que le microservice abonnements n'est pas déployé.

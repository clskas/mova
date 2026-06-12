# MOVA API Reference

Base URL: `http://localhost:3000` (api-gateway)

All routes are prefixed with `/api` except `/health`.

## Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/otp/request` | Public | Request OTP |
| POST | `/api/auth/otp/verify` | Public | Verify OTP, get JWT |
| GET | `/api/users/me` | JWT | Current user profile |
| PATCH | `/api/users/me` | JWT | Update profile |

## Services MOVA

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/services` | Public | Liste des services (taxi, colis, repas, etc.) |

## Rides

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/rides/estimate` | JWT | Fare estimate (CDF) |
| POST | `/api/rides` | JWT | Create ride (publishes `ride.created`) |
| GET | `/api/rides` | JWT | Ride history |
| GET | `/api/rides/:id` | JWT | Ride detail |
| POST | `/api/rides/:id/search` | JWT | Search drivers |
| POST | `/api/rides/:id/accept` | JWT | Driver accepts |
| PATCH | `/api/rides/:id/status` | JWT | Update status |
| POST | `/api/rides/:id/cancel` | JWT | Cancel ride |

## Réservations planifiées

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/rides/scheduled` | JWT | Créer réservation (J+7 max, CDF) |
| GET | `/api/rides/scheduled` | JWT | Liste des réservations |
| POST | `/api/rides/scheduled/:id/cancel` | JWT | Annuler réservation |

## Courses & commissions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/errands/estimate` | JWT | Estimer course/commission (CDF) |
| POST | `/api/errands` | JWT | Créer commande courses/commissions |
| GET | `/api/errands` | JWT | Historique commandes |
| GET | `/api/errands/:id` | JWT | Détail commande |

## Covoiturage

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/carpool` | JWT | Créer trajet covoiturage |
| GET | `/api/carpool` | JWT | Lister trajets (matching stub par proximité) |
| GET | `/api/carpool/mine` | JWT | Mes trajets (conducteur/passager) |
| POST | `/api/carpool/:id/join` | JWT | Rejoindre un trajet |

## Location véhicule

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/rental/inquiries` | JWT | Soumettre demande de location |
| GET | `/api/rental/inquiries` | JWT | Mes demandes |
| GET | `/api/rental/inquiries/:id` | JWT | Détail demande |

## Livraisons

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/deliveries/parcel/estimate` | JWT | Estimer livraison colis (CDF) |
| POST | `/api/deliveries/parcel` | JWT | Créer livraison colis |
| POST | `/api/deliveries/food/estimate` | JWT | Estimer commande repas (CDF) |
| POST | `/api/deliveries/food` | JWT | Commander livraison repas |
| GET | `/api/deliveries/restaurants` | JWT | Restaurants Kinshasa (5 partenaires) |
| GET | `/api/deliveries/history` | JWT | Historique livraisons |
| GET | `/api/deliveries/:id` | JWT | Détail livraison + suivi statut |
| PATCH | `/api/deliveries/:id/status` | JWT | Mettre à jour statut (`PICKED_UP`, `IN_TRANSIT`, `DELIVERED`) |

## Geo

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/geo/communes` | Public | Kinshasa communes |

## Payments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/wallet` | JWT | Wallet balance |
| POST | `/api/wallet/withdraw` | JWT | Withdraw to mobile money |
| POST | `/api/payments/rides/:rideId` | JWT | Pay for ride |

## Drivers

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| PATCH | `/api/drivers/availability` | JWT | Set availability |
| POST | `/api/drivers/location` | JWT | Update GPS |
| POST | `/api/drivers/kyc` | JWT | Upload KYC |
| GET | `/api/drivers/earnings` | JWT | Earnings summary |
| GET | `/api/drivers/profile` | JWT | Driver profile |

## Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notifications` | JWT | List notifications |
| PATCH | `/api/notifications/:id/read` | JWT | Mark read |

## Admin

Requires JWT with `role: ADMIN`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/metrics` | Dashboard metrics |
| GET | `/api/admin/users` | User list |
| GET | `/api/admin/kyc/pending` | Pending KYC |
| POST | `/api/admin/kyc/:id/review` | Approve/reject KYC |
| GET | `/api/admin/incidents` | Incidents |
| POST | `/api/admin/incidents/:id/resolve` | Resolve incident |
| GET | `/api/admin/deliveries` | Deliveries overview |
| GET | `/api/admin/scheduled-rides` | Scheduled rides overview |

## Covoiturage

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/carpool` | JWT | Créer trajet covoiturage |
| GET | `/api/carpool` | JWT | Rechercher trajets (stub matching) |
| GET | `/api/carpool/mine` | JWT | Mes trajets |
| POST | `/api/carpool/:id/join` | JWT | Rejoindre un trajet |

## Courses & commissions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/errands/estimate` | JWT | Estimer course/commission (CDF) |
| POST | `/api/errands` | JWT | Créer commande |
| GET | `/api/errands` | JWT | Historique |
| GET | `/api/errands/:id` | JWT | Détail |

## Location véhicule

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/rental/inquiry` | JWT | Demande de location (stub) |
| GET | `/api/rental/inquiries` | JWT | Mes demandes |

## WebSocket

Connect to ride-service: `ws://localhost:3002/tracking`

| Event | Direction | Payload |
|-------|-----------|---------|
| `driver:location` | Client → Server | `{ userId, lat, lng, rideId? }` |
| `ride:subscribe` | Client → Server | `{ rideId }` |
| `ride:status` | Client → Server | `{ rideId, status }` |
| `driver:location` | Server → Client | `{ lat, lng, ts }` |

## Health

`GET /health` on gateway returns aggregated status of all services.

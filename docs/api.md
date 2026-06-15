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

## Rides (Taxi / Moto-taxi Kinshasa)

Catégories véhicule : `MOTO`, `STANDARD`, `CONFORT`, `VIP` (alias backend : `MOTO_TAXI`, `COMFORT`).

Cycle de vie mobile : `REQUESTED` → `MATCHING` → `DRIVER_ASSIGNED` → `ARRIVING` → `IN_PROGRESS` → `COMPLETED`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/rides/estimate` | JWT | Estimation tarif CDF |
| POST | `/api/rides` | JWT | Créer course (`REQUESTED`) |
| GET | `/api/rides/history` | JWT | Historique passager/chauffeur |
| GET | `/api/rides` | JWT | Alias historique |
| GET | `/api/rides/:id` | JWT | Détail + chauffeur si assigné |
| POST | `/api/rides/:id/search` | JWT | Matching (2 km + 1 km/30 s) |
| POST | `/api/rides/:id/accept` | JWT | Accepter (chauffeur) |
| PATCH | `/api/rides/:id/status` | JWT | Transition statut |
| POST | `/api/rides/:id/cancel` | JWT | Annulation (PRD §4.4) |
| POST | `/api/ratings` | JWT | Noter après course terminée |

### POST `/api/rides/estimate`

**Request**
```json
{
  "pickupLat": -4.3217,
  "pickupLng": 15.3125,
  "dropoffLat": -4.3389,
  "dropoffLng": 15.3264,
  "vehicleType": "MOTO"
}
```

**Response 200**
```json
{
  "vehicleType": "MOTO",
  "distanceKm": 2.15,
  "etaMinutes": 5,
  "baseFareCdf": 1500,
  "distanceFareCdf": 1720,
  "durationFareCdf": 500,
  "surchargeCdf": 0,
  "totalCdf": 3720,
  "totalFormatted": "3 720 FC",
  "estimatedFareCdf": 3720,
  "estimatedPriceCdf": 3720,
  "currency": "CDF",
  "surchargeMultiplier": 1
}
```

### POST `/api/rides`

**Request**
```json
{
  "pickupLat": -4.3217,
  "pickupLng": 15.3125,
  "pickupAddress": "Gombe, Kinshasa",
  "dropoffLat": -4.3389,
  "dropoffLng": 15.3264,
  "dropoffAddress": "Limete, Kinshasa",
  "vehicleType": "STANDARD"
}
```

**Response 201**
```json
{
  "id": "uuid",
  "status": "REQUESTED",
  "vehicleType": "STANDARD",
  "pickupAddress": "Gombe, Kinshasa",
  "dropoffAddress": "Limete, Kinshasa",
  "totalCdf": 8500,
  "totalFormatted": "8 500 FC",
  "currency": "CDF",
  "estimate": { "...": "voir /estimate" },
  "nextStep": "POST /api/rides/:id/search"
}
```

### POST `/api/rides/:id/search`

**Response 200**
```json
{
  "rideId": "uuid",
  "status": "MATCHING",
  "attempt": 1,
  "radiusKm": 2,
  "nextRadiusKm": 3,
  "incrementIntervalSec": 30,
  "maxRadiusKm": 10,
  "driversFound": 2,
  "matchingWeights": {
    "proximity": 0.5,
    "rating": 0.25,
    "acceptanceRate": 0.15,
    "seniority": 0.1
  },
  "drivers": [
    {
      "driverId": "uuid",
      "userId": "uuid",
      "lat": -4.322,
      "lng": 15.313,
      "rating": 4.8,
      "distanceKm": 0.4,
      "score": 0.912
    }
  ]
}
```

### PATCH `/api/rides/:id/status`

**Request** (statuts mobile acceptés)
```json
{ "status": "IN_PROGRESS" }
```

Valeurs : `MATCHING`, `DRIVER_ASSIGNED`, `ARRIVING`, `IN_PROGRESS`, `COMPLETED`.

### POST `/api/rides/:id/cancel`

**Request**
```json
{ "reason": "Changement de plan" }
```

**Response 200**
```json
{
  "ride": { "status": "CANCELLED", "...": "..." },
  "cancellationFeeCdf": 0,
  "cancellationFeeFormatted": "0 FC",
  "message": "Annulation gratuite dans les 3 premières minutes."
}
```

Politique Kinshasa (seed) :

| Catégorie | Gratuit | Frais passager |
|-----------|---------|----------------|
| MOTO | 2 min | 1 000 FC |
| STANDARD | 3 min | 2 000 FC |
| CONFORT | 5 min | 3 000 FC |
| VIP | 5 min | 5 000 FC |

### GET `/api/rides/history?role=passenger`

**Response 200**
```json
[
  {
    "id": "uuid",
    "status": "COMPLETED",
    "vehicleType": "MOTO",
    "pickupAddress": "Gombe, Kinshasa",
    "dropoffAddress": "Limete, Kinshasa",
    "priceCdf": 7500,
    "totalCdf": 7500,
    "distanceKm": 3.2,
    "createdAt": "2026-06-13T10:00:00.000Z"
  }
]
```

### GET `/api/rides/:id`

Inclut `driver` quand assigné :
```json
{
  "id": "uuid",
  "status": "DRIVER_ASSIGNED",
  "driver": {
    "userId": "uuid",
    "rating": 4.9,
    "totalRides": 842,
    "lat": -4.322,
    "lng": 15.313,
    "vehicle": {
      "type": "STANDARD",
      "make": "Toyota",
      "model": "Corolla",
      "plate": "KIN-1234-AB",
      "color": "Blanc"
    }
  }
}
```

### POST `/api/ratings`

**Request**
```json
{
  "rideId": "uuid",
  "toUserId": "driver-user-uuid",
  "score": 5,
  "comment": "Excellent chauffeur"
}
```

### Erreurs (français)

```json
{
  "statusCode": 404,
  "code": "MOVA_RIDE_001",
  "message": "Course introuvable."
}
```

Codes courants : `MOVA_RIDE_003` (aucun chauffeur), `MOVA_RIDE_004` (course active), `MOVA_RIDE_010` (déjà noté), `MOVA_RIDE_011` (transition invalide).

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
| GET | `/api/geo/communes` | Public | 22 communes Kinshasa |
| GET | `/api/geo/autocomplete?q=` | Public | Autocomplétion (communes + Mapbox si token) |

**GET `/api/geo/autocomplete?q=gom`**
```json
[
  {
    "source": "commune",
    "label": "Gombe, Kinshasa",
    "address": "Gombe, Kinshasa, RDC",
    "lat": -4.3217,
    "lng": 15.3125,
    "commune": "Gombe",
    "city": "Kinshasa"
  }
]
```

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
| GET | `/api/admin/users/:id` | User detail |
| PATCH | `/api/admin/users/:id` | Update user (role, phone, status) |
| GET | `/api/admin/drivers` | Driver list |
| GET | `/api/admin/drivers/:userId` | Driver detail |
| PATCH | `/api/admin/drivers/:userId/status` | Activate/suspend driver |
| GET | `/api/admin/kyc/pending` | Pending KYC |
| POST | `/api/admin/kyc/:id/review` | Approve/reject KYC |
| GET | `/api/admin/rides` | Ride list (filters: status, from, to) |
| GET | `/api/admin/rides/:id` | Ride detail |
| POST | `/api/admin/rides/:id/cancel` | Admin cancel ride |
| GET | `/api/admin/incidents` | Incidents |
| POST | `/api/admin/incidents/:id/resolve` | Resolve incident |
| GET | `/api/admin/deliveries` | Deliveries overview |
| GET | `/api/admin/deliveries/:id` | Delivery detail |
| PATCH | `/api/admin/deliveries/:id/status` | Update delivery status |
| GET | `/api/admin/scheduled-rides` | Scheduled rides overview |
| POST | `/api/admin/scheduled-rides/:id/cancel` | Cancel scheduled ride |
| GET | `/api/admin/restaurants` | Restaurant list |
| POST | `/api/admin/restaurants` | Create restaurant |
| PATCH | `/api/admin/restaurants/:id` | Update restaurant |
| GET | `/api/admin/pricing-rules?city=` | Pricing rules (filter by city) |
| PATCH | `/api/admin/pricing-rules/:vehicleType` | Update pricing rule (body must include `city`) |
| GET | `/api/admin/delivery-pricing-rules` | Delivery surcharges (PARCEL/FOOD/EXPRESS) |
| PATCH | `/api/admin/delivery-pricing-rules/:category` | Update delivery surcharge |

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

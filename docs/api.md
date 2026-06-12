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

## Rides

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/rides/estimate` | Public | Fare estimate (CDF) |
| POST | `/api/rides` | JWT | Create ride (publishes `ride.created`) |
| GET | `/api/rides` | JWT | Ride history |
| GET | `/api/rides/:id` | JWT | Ride detail |
| POST | `/api/rides/:id/search` | JWT | Search drivers |
| POST | `/api/rides/:id/accept` | JWT | Driver accepts |
| PATCH | `/api/rides/:id/status` | JWT | Update status |
| POST | `/api/rides/:id/cancel` | JWT | Cancel ride |

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

# MOVA Microservices

Point d'entrée unique : **API Gateway** sur le port **3000**.

| Service | Port local | Base de données | Rôle |
|---------|------------|-----------------|------|
| api-gateway | 3000 | — | Routage, JWT, throttling, health agrégé |
| auth-service | 3001 | postgres-auth | OTP, JWT, utilisateurs |
| ride-service | 3002 | postgres-rides | Courses, geo, tarifs, WebSocket `/tracking`, notes |
| payment-service | 3003 | postgres-payments | Wallet, mobile money |
| driver-service | 3004 | postgres-drivers | Chauffeurs, KYC, matching, incidents |
| notification-service | 3005 | postgres-notifications | Push, SMS, in-app |
| admin-service | 3006 | — | Métriques, validation KYC, litiges |

## Variables d'environnement communes

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret partagé pour valider les JWT |
| `REDIS_URL` | Pub/sub inter-services |
| `INTERNAL_API_KEY` | Clé pour routes `/internal/*` |
| `MOCK_OTP` | `true` → OTP `123456` |
| `MOCK_PAYMENTS` | `true` → paiements simulés |

## URLs inter-services (Docker)

```
AUTH_SERVICE_URL=http://auth-service:3000
RIDE_SERVICE_URL=http://ride-service:3000
PAYMENT_SERVICE_URL=http://payment-service:3000
DRIVER_SERVICE_URL=http://driver-service:3000
NOTIFICATION_SERVICE_URL=http://notification-service:3000
ADMIN_SERVICE_URL=http://admin-service:3000
```

## Migrations Prisma

Services avec base dédiée (production : `migrate deploy`, dev : `migrate dev`) :

```powershell
# Depuis la racine
npm run migrate:all
npm run seed:rides

# Ou service par service
cd services/auth-service; npm run prisma:deploy
cd services/ride-service; npm run prisma:deploy; npm run prisma:seed
cd services/payment-service; npm run prisma:deploy
cd services/driver-service; npm run prisma:deploy
cd services/notification-service; npm run prisma:deploy
```

### Seed (ride-service)

Après `prisma migrate deploy`, exécuter le seed pour charger communes Kinshasa, tarifs CDF et politiques d'annulation :

```powershell
cd services/ride-service
npx prisma db seed
# ou depuis la racine : npm run seed:rides
```

Docker Compose : `docker compose exec ride-service npx prisma db seed`

## Build

```powershell
cd ../..; npm run build:services
```

## Health

- Gateway : `GET http://localhost:3000/health`
- Service direct : `GET http://localhost:3001/health` (auth), etc.

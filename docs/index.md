# MOVA RDC — Documentation

Bienvenue dans la documentation technique de MOVA, plateforme de mobilité pour Kinshasa, RDC.

## Quick Start

```bash
docker compose up -d postgres redis
cd backend && npm install && npx prisma migrate dev && npm run start:dev
```

## Stack

- **Mobile** : Flutter 3.x (flavors passenger/driver)
- **Backend** : NestJS + Prisma + Socket.io
- **Web** : Next.js 14 PWA
- **Admin** : Next.js back-office
- **DB** : PostgreSQL 16 + Redis 7

## Adaptations RDC

| Paramètre | Valeur |
|-----------|--------|
| Devise | CDF (Franc congolais) |
| Téléphone | +243 |
| Mobile money | Orange Money, M-Pesa, Airtel Money |
| Ville | Kinshasa |
| Fuseau | Africa/Kinshasa |

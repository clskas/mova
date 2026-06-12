# MOVA — Morning Brief (v1.3.0)

**Date:** 2026-06-12 · **Repo:** [clskas/mova](https://github.com/clskas/mova) · **Branch:** `main`

## Overnight summary

MOVA v1.3.0 ships the full multi-service platform: backend APIs, mobile flows, web PWA, admin console, and branded `movaicone` assets across all clients.

| Area | Status |
|------|--------|
| Backend (ride-service) | Livraison colis, réservation planifiée, repas, courses, covoiturage, location (stub), catalogue `/api/services` |
| Mobile Flutter | 8 service cards, navigation complète, historique multi-onglets, icônes branded |
| Web PWA v1.3.0 | Taxi, colis, repas, historique + PWA manifest |
| Admin | Métriques, users, KYC, litiges, livraisons & planifiées |
| Icons | `movaicone` — launcher, splash Android, OTP screens, service cards, web/admin headers & favicons |
| Ops | `scripts/verify-all.ps1`, `scripts/generate-icons.ps1`, `docker compose` health |

## Quick start

```powershell
cd c:\Users\Administrator\Mova
docker compose up -d
.\scripts\verify-all.ps1
```

| Client | URL / command |
|--------|---------------|
| API Gateway | http://localhost:3000/health |
| Web PWA | `cd web; npm run dev` → http://localhost:3001 |
| Admin | `cd admin; npm run dev` → http://localhost:3002 |
| Mobile | `cd mobile; flutter run --flavor passenger` |

## Tests

```powershell
cd mobile; flutter test          # 11 widget tests (home, overflow, navigation)
cd services/ride-service; npm test
.\scripts\verify-all.ps1         # health + flutter + web/admin builds
```

## Icons (`movaicone`)

Source: `mobile/assets/icon/movaicone.png`

```powershell
.\scripts\generate-icons.ps1
cd mobile; dart run flutter_launcher_icons
```

Generates: web PWA icons, admin favicon, Android splash, launcher foregrounds.

## New API endpoints (gateway `:3000`)

- `GET /api/services` — catalogue
- `POST/GET /api/deliveries` — colis
- `POST/GET /api/rides/scheduled` — réservations J+7
- `GET /api/restaurants`, `POST /api/food-orders` — repas
- `POST /api/errands` — courses & commissions
- `POST/GET /api/carpool` — covoiturage
- `POST /api/rental/inquiry` — location (stub)
- Admin: `GET /api/admin/deliveries`, `GET /api/admin/scheduled-rides`

## Mobile service flows

| Service | Screen | Test assertion |
|---------|--------|----------------|
| Livraison colis | `ParcelDeliveryScreen` | « Catégorie de poids » |
| Réservation planifiée | `ScheduledRideScreen` | « Maximum J+7 » |
| Livraison repas | `FoodDeliveryScreen` | « Restaurants à proximité » |
| Courses & commissions | `ErrandScreen` | overflow 320–428px |
| Covoiturage | `CarpoolScreen` | overflow 320–428px |

## Docs

- `docs/manuel-utilisateur.md` — guide utilisateur complet
- `docs/api.md` — référence endpoints
- `CHANGELOG.md` — détail v1.3.0

## CI / deploy

- GitHub Actions: build 7 microservices → GHCR
- Render: multi-service via `render.yaml`
- Secrets: **never commit** `.env`, tokens, or credentials

## If something fails

1. `docker compose ps` — all services healthy?
2. `curl http://localhost:3000/health` — gateway up?
3. `cd services/ride-service; npx prisma migrate deploy` — DB migrations?
4. Mobile mock mode: works offline via `ApiClient.mock()` when gateway down

---

*Generated overnight 2026-06-12. Run `.\scripts\verify-all.ps1` for live status.*

# MOVA — Morning Brief (v1.4.0)

**Date:** 2026-06-13 · **Repo:** [clskas/mova](https://github.com/clskas/mova) · **Branch:** `main`

## Overnight summary

MOVA v1.4.0 ships the complete admin console: RBAC multi-page UI, demo seed data, Playwright coverage, and documented startup on port **3002**.

| Area | Status |
|------|--------|
| Admin UI | 13 pages + RBAC (SUPER_ADMIN, ADMIN, SUPPORT, FINANCE, CONTENT) |
| Admin seed | `seed-admin.ps1` + `seed-admin-demo.ps1` |
| Playwright | login OTP, utilisateurs, restaurants |
| Docker | Microservices only — admin UI runs via `npm run dev` on **3002** |

## Quick start — Admin

```powershell
cd c:\Users\Administrator\Mova
docker compose up -d
npm run migrate:all
npm run seed:admin-demo

cd admin && Copy-Item .env.example .env.local && npm install && npm run dev
```

**http://localhost:3002/login** — `+243900000001` / OTP `123456` (SUPER_ADMIN)

## Demo data seeded

| Entity | Count |
|--------|-------|
| Admin SUPER_ADMIN | 1 |
| Passengers | 3 |
| Drivers | 4 (3 KYC pending) |
| Incidents | 3 (2 OPEN) |
| Rides completed | 3 |
| Deliveries | 2 |
| Scheduled rides | 2 |
| Restaurants | 5 (ride catalog) |

## Admin CRUD completeness

| Page | CRUD |
|------|------|
| `/utilisateurs` | ✅ Read + edit role/status |
| `/kyc` | ✅ Approve/Reject |
| `/litiges` | ✅ Resolve |
| `/restaurants` | ✅ List + Create |
| `/tarifs` | ✅ Edit pricing rules |
| `/livraisons`, `/planifiees`, `/courses` | Read + filters |
| `/chauffeurs` | Read + activate/deactivate |

## Ports

| Client | Port |
|--------|------|
| API Gateway | 3000 |
| Web PWA dev | 3001 |
| **Admin UI dev** | **3002** |
| Ride service (Docker) | **3022** |
| Admin API | 3006 |

## Tests

```powershell
cd e2e && npm run test:e2e:admin
.\scripts\verify-all.ps1
```

---

*Run `npm run seed:admin-demo` if dashboard sections are empty.*

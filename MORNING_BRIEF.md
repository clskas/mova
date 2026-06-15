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

## Commencer à enregistrer les données

### 1. Backend prêt

```powershell
cd c:\Users\Administrator\Mova
docker compose up -d
npm run migrate:all
curl http://localhost:3000/health   # ou .\scripts\verify-all.ps1
```

### 2. Base vide ou démo ?

| Option | Commande | Résultat |
|--------|----------|----------|
| **A — DB vide** | `migrate:all` seulement | Schémas OK ; catalogues ride-service (communes, tarifs, restaurants) au boot ; pas d’utilisateurs ni courses |
| **B — Démo admin** | `npm run seed:admin-demo` | SUPER_ADMIN + passagers, chauffeurs/KYC, incidents, courses, livraisons, planifiées (voir tableau ci-dessus) |

### 3. Admin + persistance

**http://localhost:3002/login** — `+243900000001` / OTP `123456` (`MOCK_OTP=true`).

Les données créées via API ou admin **persistent en PostgreSQL** : utilisateurs, KYC, restaurants, tarifs, courses, livraisons, portefeuille. Relancer Docker ne les efface pas (volumes). Détail CRUD : `docs/DATA_OWNERSHIP.md`.

### 4. Mobile — `API_URL`

| Cible | `API_URL` |
|-------|-----------|
| Android émulateur | `http://10.0.2.2:3000/api` |
| iOS / appareil physique | `http://<IP-LAN>:3000/api` |

```powershell
flutter run --flavor passenger -t lib/main_passenger.dart --dart-define=API_URL=http://10.0.2.2:3000/api
```

### 5. Encore simulé (dev)

| Mock | Comportement |
|------|--------------|
| `MOCK_OTP=true` | OTP fixe **123456** |
| `MOCK_PAYMENTS=true` | Mobile money simulé (succès auto) |
| App chauffeur | Course entrante + suivi GPS **simulés** (pas de dispatch réel) |

### 6. Maturité honnête (éval. juin 2026)

| Surface | Note | Commentaire |
|---------|------|-------------|
| Mobile passager | 7–8/10 | Parcours course/livraison branchés API |
| Admin | 8/10 | CRUD + RBAC solides |
| Mobile chauffeur | 4/10 | UI OK, missions/dispatch mock |
| Web PWA | 5/10 | Partiel vs mobile |

**Production nationale** → [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md) (`MOCK_OTP=false`, `MOCK_PAYMENTS=false`, migrations, domaines, stores).

---

*Run `npm run seed:admin-demo` if dashboard sections are empty.*

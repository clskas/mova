# MOVA — Plateforme de mobilité RDC



Plateforme de mobilité **nationwide RDC** — République Démocratique du Congo (26 provinces). Kinshasa est la ville par défaut au lancement ; l'architecture microservices supporte l'expansion nationale.



## Structure du monorepo



```

Mova/

├── services/           # Microservices NestJS (7 services + API gateway)

│   ├── api-gateway/    # Port 3000 — routing, JWT, rate limit

│   ├── auth-service/   # Port 3001 — OTP, users, JWT

│   ├── ride-service/   # Port 3022 — rides, geo, WebSocket GPS

│   ├── payment-service/# Port 3003 — wallet, mobile money

│   ├── driver-service/ # Port 3004 — drivers, KYC, incidents

│   ├── notification-service/ # Port 3005 — push, SMS, in-app

│   └── admin-service/  # Port 3006 — admin metrics, disputes

├── packages/shared/    # DTOs, RDC config, Redis events, error codes

├── mobile/             # Flutter (flavors: passenger, driver)

├── web/                # Next.js 14 PWA passager

├── admin/              # Next.js back-office

├── backend/            # Legacy pointer → see services/

├── docs/               # MkDocs documentation

├── docker/             # Dockerfiles (one per service)

├── config/             # Configuration externe

└── scripts/            # Backup, smoke tests

```



## Prérequis



- Node.js 22+

- Flutter 3.32+

- Docker & Docker Compose

- PostgreSQL 16 (5 instances) + Redis 7 via Docker Compose



## Démarrage rapide (microservices)



### 1. Configuration



```powershell

Copy-Item config/services.env.example .env

Copy-Item config/external-apis.env.example config/external-apis.env

```



### 2. Stack complète (recommandé)



```powershell

docker compose up -d --build

npm run migrate:all

npm run seed:admin-demo

.\scripts\smoke-gateway.ps1

```



| Service | URL directe | Via gateway |

|---------|-------------|-------------|

| API Gateway | http://localhost:3000 | — |

| Auth | http://localhost:3001/health | `/api/auth/*`, `/api/users/*` |

| Ride | http://localhost:3022/health | `/api/rides/*`, `/api/geo/*`, `/api/ratings/*` |

| Payment | http://localhost:3003/health | `/api/payments/*`, `/api/wallet/*` |

| Driver | http://localhost:3004/health | `/api/drivers/*`, `/api/incidents/*` |

| Notification | http://localhost:3005/health | `/api/notifications/*` |

| Admin | http://localhost:3006/health | `/api/admin/*` |



**Gateway health (agrégé):** http://localhost:3000/health



### 3. Développement local (un service)



```powershell

cd packages/shared; npm install; npm run build

cd services/auth-service

npm install; npx prisma migrate dev; npm run start:dev

```



### 4. Web PWA (passager)



```powershell

cd web

Copy-Item .env.example .env.local

npm install

npm run dev

```



Ouvrir [http://localhost:3001](http://localhost:3001). Services : taxi, livraison colis, repas, historique. PWA manifest + icônes `movaicone` dans `public/`.



| Variable | Description |

|----------|-------------|

| `NEXT_PUBLIC_API_URL` | Passerelle API (défaut `http://localhost:3000`) |



### 5. Admin UI (port 3002)

L'admin Next.js **n'est pas dans Docker** — il tourne en dev local sur le port **3002** (évite le conflit avec ride-service `:3022`).

```powershell
docker compose up -d
npm run migrate:all
npm run seed:admin-demo    # SUPER_ADMIN + données démo

cd admin
Copy-Item .env.example .env.local
npm install
npm run dev
```

Ouvrir [http://localhost:3002](http://localhost:3002).

| Identifiant | Valeur |
|-------------|--------|
| Téléphone admin | `+243900000001` |
| Rôle | `SUPER_ADMIN` |
| OTP (dev) | `123456` (`MOCK_OTP=true`) |

**Pages admin (RBAC) :** tableau de bord, utilisateurs (CRUD), chauffeurs, KYC, courses, livraisons, restaurants (CRUD), tarifs, litiges, planifiées, abonnements, portefeuille, communes.

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Passerelle API (défaut `http://localhost:3000`) |
| `NEXT_PUBLIC_ADMIN_PHONE` | Téléphone prérempli login (défaut `+243900000001`) |



### 6. Mobile Flutter



```powershell

cd mobile

flutter pub get

flutter run --flavor passenger -t lib/main_passenger.dart

flutter run --flavor driver -t lib/main_driver.dart

```



## Architecture



Les clients (mobile, web, admin) parlent uniquement au **API Gateway** (`:3000`). Chaque microservice a sa propre base PostgreSQL. La communication inter-services utilise HTTP REST (`/internal/*`) et Redis pub/sub (`ride.created`, `payment.completed`, `user.created`).



Voir [docs/architecture.md](docs/architecture.md) pour le détail.



## Vérification complète



```powershell

.\scripts\verify-all.ps1

```



Vérifie : health gateway, `flutter test`, `npm run build` (web + admin). Options : `-SkipFlutter`, `-SkipBuild`, `-GatewayUrl`.



## Documentation

- **Manuel utilisateur (MkDocs)** : [`docs/user-manual/`](docs/user-manual/index.md) — passager, chauffeur, admin (source de vérité pour l'aide in-app mobile)
- **MkDocs** : `mkdocs serve` (après `pip install mkdocs-material`) — nav complète dans `mkdocs.yml`
- **Technique** : [`docs/architecture.md`](docs/architecture.md), [`docs/api.md`](docs/api.md), [`docs/cicd.md`](docs/cicd.md)



## Déploiement



- **CI/CD**: GitHub Actions → GHCR (7 images) → Render + build clients (web/admin)

- **Blueprint**: `render.yaml`

- Voir `docs/deployment.md` et `docs/cicd.md`



## Dev flags



- `MOCK_OTP=true` — code OTP fixe `123456`

- `MOCK_PAYMENTS=true` — paiements mobile money simulés



## Adaptations RDC



- Devise: CDF (Franc congolais)

- Téléphone: +243

- Mobile money: Orange Money, M-Pesa, Airtel Money

- Couverture: nationwide RDC (26 provinces) — Kinshasa ville par défaut, communes seed

- Fuseau: Africa/Kinshasa

- UI: Français



## Tests E2E (Playwright + Appium)

Installation et exécution : voir [`docs/testing-e2e.md`](docs/testing-e2e.md).

```powershell
cd e2e && npm install && npm run playwright:install
npm run test:e2e          # web + admin (skip si apps arrêtées)
npm run test:mobile       # smoke Android (Appium + appareil)
```



## Licence



Propriétaire — MOVA RDC


# Changelog

## [1.4.0] — 2026-06-13

### Added — Admin complet
- **`scripts/seed-admin-demo.ps1`** — jeu de données démo cross-services (users, KYC, incidents, rides, livraisons, planifiées)
- **`prisma/seed-demo.ts`** — auth, driver, ride services
- **Admin RBAC** — 13 pages (`utilisateurs`, `restaurants`, `tarifs`, `kyc`, `litiges`, …) avec rôles SUPER_ADMIN / ADMIN / SUPPORT / FINANCE / CONTENT
- **Playwright** — `admin-login` (OTP), `admin-users`, `admin-restaurants`
- **npm scripts** — `seed:admin`, `seed:admin-demo`

### Changed
- `scripts/seed-admin.ps1` — DATABASE_URL par défaut documenté, renvoie vers seed-demo
- `README.md` — guide admin complet (credentials, ports, CRUD status)
- `MORNING_BRIEF.md` — v1.4.0 quick start admin
- `admin/.env.example` — `NEXT_PUBLIC_ADMIN_PHONE`
- Port ride-service Docker corrigé dans README (**3022**, admin UI reste **3002**)
- Version monorepo `1.4.0`

## [1.3.0] — 2026-06-12

### Added — Services SENGA complets (ride-service)
- **Livraison colis** — estimation CDF, CRUD, suivi statuts (`PENDING` → `PICKED_UP` → `IN_TRANSIT` → `DELIVERED`)
- **Réservation planifiée** — création jusqu'à J+7, liste, annulation
- **Livraison repas** — 5 restaurants Kinshasa seed, menu, estimation et commande
- **Courses & commissions** — formulaire liste, estimation, commande livreur
- **Covoiturage** — création trajet, recherche stub, rejoindre trajet, partage prix
- **Location véhicule** — demande de devis (stub inquiry)
- **Catalogue services** — `GET /api/services` avec métadonnées FR et disponibilité
- Modèles Prisma : `Delivery`, `ScheduledRide`, `Restaurant`, `CarpoolTrip`, `ErrandOrder`, `RentalInquiry`
- Admin : `GET /api/admin/deliveries`, `GET /api/admin/scheduled-rides`

### Added — Mobile Flutter (passager + chauffeur)
- Écrans : livraison colis, suivi colis, réservation planifiée, livraison repas, courses & commissions, covoiturage
- Historique multi-onglets : Trajets | Colis | Repas | Réservations | Courses
- Grille d'accueil sans « Bientôt » pour les services implémentés
- Intégration API gateway + repli mock_data
- Tests overflow 320–428px et navigation services

### Added — Web PWA & Admin
- PWA passager : taxi, colis, repas, historique, sélection services
- Admin : métriques live, utilisateurs, KYC, litiges, livraisons & planifiées
- Manifest PWA + icônes movaicone

### Added — Documentation & ops
- `docs/manuel-utilisateur.md` — guide complet tous services
- `docs/api.md` — endpoints livraisons, planifiées, covoiturage, courses, location
- `scripts/verify-all.ps1` — vérification complète (docker, health, builds, tests)
- `MORNING_BRIEF.md` — démarrage rapide overnight

### Changed
- Gateway proxy : `/api/deliveries`, `/api/services`, `/api/carpool`, `/api/errands`, `/api/rental`
- Version monorepo `1.3.0`

## [1.2.0] — 2026-06-12

### Changed
- Refactorisation **microservices** : monolithe backend remplacé par 7 services NestJS + API Gateway
- Bases PostgreSQL dédiées par domaine (auth, rides, payments, drivers, notifications)
- Communication inter-services : HTTP interne + Redis pub/sub
- CI/CD : 7 images Docker poussées vers GHCR, déploiement Render multi-services
- Clients branchés exclusivement sur le gateway (`:3000`)

### Added
- `packages/shared` — config RDC nationwide, codes erreur SENGA, Redis pub/sub, URLs services
- `services/README.md` — ports, env vars, migrations `deploy`, seed ride-service
- Racine `package.json` — workspaces, `build:all`, `migrate:all`, `seed:rides`, `test:gateway`
- Health agrégé gateway + smoke tests via gateway
- `prisma:deploy` sur les 5 services avec base PostgreSQL

### Fixed
- Jest open handles (api-gateway) — mock fetch en e2e, AbortController avec clearTimeout

## [1.1.0] — 2026-06-12

### Changed
- Clients (mobile, web, admin) pointent vers la passerelle API microservices unique (`API_URL` / `NEXT_PUBLIC_API_URL`)
- WebSocket GPS mobile via passerelle (proxy ride-service) avec repli mode démo
- Copy UX nationwide RDC (Kinshasa reste ville par défaut)
- Icône `movaicone` : launcher Flutter (flavors passager/chauffeur), PWA web, favicon admin

## [1.0.0] — 2026-06-12

### Added
- Clients MVP : Flutter passager/chauffeur (flavors), PWA web, admin Next.js
- Design system SENGA (Midnight, Violet, Green, Orange, Cloud) + anti-overflow
- Mode mock/hors-ligne avec cache historique courses
- Tests widget overflow 320–428px
- Monorepo SENGA RDC complet (Flutter, NestJS, Next.js)
- Auth OTP +243 avec mode mock
- Module rides + matching + tarification CDF
- WebSocket GPS tracking
- Apps Flutter passager et chauffeur (flavors)
- PWA passager et admin back-office
- PaymentProvider abstraction (Orange Money, M-Pesa, Airtel Money)
- CI/CD GitHub Actions → GHCR → Render
- Documentation MkDocs
- CGU et politique de confidentialité FR
- Seed communes Kinshasa + tarifs moto-taxi/standard/confort

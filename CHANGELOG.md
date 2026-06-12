# Changelog

## [1.2.0] — 2026-06-12

### Changed
- Refactorisation **microservices** : monolithe backend remplacé par 7 services NestJS + API Gateway
- Bases PostgreSQL dédiées par domaine (auth, rides, payments, drivers, notifications)
- Communication inter-services : HTTP interne + Redis pub/sub
- CI/CD : 7 images Docker poussées vers GHCR, déploiement Render multi-services
- Clients branchés exclusivement sur le gateway (`:3000`)

### Added
- `packages/shared` — config RDC nationwide, codes erreur MOVA, Redis pub/sub, URLs services
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
- Design system MOVA (Midnight, Violet, Green, Orange, Cloud) + anti-overflow
- Mode mock/hors-ligne avec cache historique courses
- Tests widget overflow 320–428px
- Monorepo MOVA RDC complet (Flutter, NestJS, Next.js)
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

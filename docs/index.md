# SENGA RDC — Documentation

Bienvenue dans la documentation technique de SENGA, plateforme de mobilité nationwide pour la RDC (26 provinces, Kinshasa par défaut).

## Quick Start

```powershell
Copy-Item config/services.env.example .env
docker compose up -d --build
npm run migrate:all
npm run seed:rides
.\scripts\smoke-gateway.ps1
```

## Clients

| Client | Stack | Port dev | Variable API |
|--------|-------|----------|--------------|
| Mobile passager/chauffeur | Flutter 3.32+ | — | `API_URL` |
| Web PWA | Next.js 14 | 3001 | `NEXT_PUBLIC_API_URL` |
| Admin | Next.js 14 | 3002 | `NEXT_PUBLIC_API_URL` |

```powershell
# Web PWA
cd web && npm install && npm run dev

# Admin
cd admin && npm install && npm run dev
```

## Stack backend

- **Microservices** : 7 services NestJS + API Gateway (port 3000)
- **DB** : PostgreSQL 16 (5 instances) + Redis 7
- **CI/CD** : GitHub Actions → GHCR → Render

## Vérification complète

```powershell
.\scripts\verify-all.ps1
```

Vérifie : health gateway, `flutter test`, `npm run build` (web + admin).

## Adaptations RDC

| Paramètre | Valeur |
|-----------|--------|
| Devise | CDF (Franc congolais) |
| Téléphone | +243 |
| Mobile money | Orange Money, M-Pesa, Airtel Money |
| Ville par défaut | Kinshasa |
| Fuseau | Africa/Kinshasa |

## Documentation utilisateur

Manuel vivant (source de vérité pour l'aide in-app mobile) :

- [Vue d'ensemble](user-manual/index.md)
- [Passager](user-manual/passager.md)
- [Chauffeur](user-manual/chauffeur.md)
- [Admin](user-manual/admin.md)

Lancer la doc : `mkdocs serve` (après `pip install mkdocs-material`).

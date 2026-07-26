# Stratégie microservices SENGA

**Décision (2026)** : conserver l’architecture microservices (7 services NestJS + api-gateway) et réduire la charge opérationnelle par consolidation d’infrastructure — sans fusionner le code applicatif.

## Pourquoi garder les microservices

| Facteur | Raison |
|---------|--------|
| **Montée en charge ride** | Le `ride-service` (courses, geo, WebSocket `/tracking`, tarifs) peut scaler indépendamment du reste. |
| **Isolation auth** | OTP, JWT et données utilisateurs restent isolés dans `auth-service` (surface d’attaque et conformité). |
| **Croissance équipe** | Frontières claires par domaine (paiements, chauffeurs, notifications, admin) pour ownership et revues ciblées. |
| **Déploiements partiels** | Correction d’un bug paiement sans redéployer ride ou auth. |

## Ce que nous consolidons

| Domaine | Local (Docker) | Production (Render / Neon) |
|---------|----------------|---------------------------|
| **PostgreSQL** | Une instance, 5 bases logiques (`mova_auth`, `mova_rides`, …) | Render : 5 Postgres séparés aujourd’hui ; migration possible vers **un cluster Neon** avec les mêmes noms de bases |
| **Variables d’environnement** | `config/services.env.example`, scripts `migrate-all.ps1` / `smoke-all.ps1` | Groupes Render `mova-external-apis` inchangés |
| **Observabilité** | `X-Request-Id` généré au gateway, propagé aux services, loggé | Même en-tête pour corréler logs multi-services |
| **Scripts ops** | `npm run migrate:all`, `scripts/smoke-all.ps1` | `prisma migrate deploy` au démarrage des conteneurs (inchangé) |

## Ce que nous ne faisons pas

- Pas de réécriture monolithe.
- Pas de Kubernetes pour l’instant (Docker Compose local, Render managed en prod).
- Pas de fusion des codebases de services.
- Pas de base unique partagée entre domaines (une instance Postgres, mais **une base par service**).

## Corrélation des requêtes (`X-Request-Id`)

1. L’`api-gateway` lit `X-Request-Id` entrant ou génère un UUID.
2. L’identifiant est renvoyé au client et transmis aux services en amont via le proxy.
3. `auth-service` et `ride-service` (minimum) journalisent l’ID ; les autres services peuvent activer le même middleware partagé (`@mova/shared`).

## Bases de données

### Développement local

Même hôte Postgres, bases distinctes. Depuis l’hôte : port **54320** (mapping Docker) ou **5432** si libre.

```
postgresql://mova:mova@localhost:54320/mova_auth
postgresql://mova:mova@localhost:54320/mova_rides
postgresql://mova:mova@localhost:54320/mova_payments
postgresql://mova:mova@localhost:54320/mova_drivers
postgresql://mova:mova@localhost:54320/mova_notifications
```

Initialisation : `docker/postgres/init-databases.sql` au premier `docker compose up`.

### Production

- **Render (actuel)** : 5 bases managées distinctes dans `render.yaml` — aucun changement obligatoire.
- **Option Neon** : un cluster, plusieurs bases avec les mêmes `DATABASE_URL` (host commun, `databaseName` différent). Mettre à jour uniquement les variables d’environnement Render.

## Roadmap en 3 phases

### Phase 1 — Fondations ops (cette livraison)

- [x] Document de stratégie (ce fichier)
- [x] `X-Request-Id` gateway + services critiques
- [x] Postgres unique en Docker Compose
- [x] Scripts `migrate-all.ps1` et `smoke-all.ps1`

### Phase 2 — Observabilité et env unifiés

- [ ] Middleware `RequestId` sur tous les services
- [ ] Logs structurés JSON (requestId, service, durée)
- [ ] Centralisation des secrets (Render env groups + doc Neon)
- [ ] Dashboard santé agrégé (gateway `/health` enrichi)

### Phase 3 — Scale et résilience

- [ ] Évaluer cluster Neon unique en production
- [ ] Cache Redis partagé (sessions, rate limit distribué)
- [ ] CI smoke sur chaque PR (`smoke-all.ps1`)
- [ ] Envisager K8s ou autoscaling Render uniquement si charge ride > seuil défini

## Vérification locale

```powershell
docker compose up -d --build
npm run migrate:all
# ou
powershell -File scripts/migrate-all.ps1

powershell -File scripts/smoke-all.ps1
npm run test:gateway
npm test --prefix services/ride-service
```

## Références

- [architecture.md](./architecture.md)
- [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md)
- [deployment.md](./deployment.md)

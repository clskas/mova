# Deployment

## Docker Compose (local / staging)

```bash
cp config/services.env.example .env
docker compose up -d --build
```

Seed ride pricing data:

```bash
docker compose exec ride-service npx prisma db seed
```

Gateway: http://localhost:3000/health

## Render

`render.yaml` defines:

- 7 web services (gateway + 6 microservices)
- 5 PostgreSQL databases
- 1 Redis instance
- Optional web frontend

Deploy via Render Blueprint or connect the GitHub repo and use the deploy workflow.

## Environment

Copy `config/services.env.example` and set:

- `JWT_SECRET` — shared across all services
- `INTERNAL_API_KEY` — inter-service auth
- `MOCK_OTP` / `MOCK_PAYMENTS` — disable in production
- Per-service `DATABASE_URL`
- `REDIS_URL` for auth, ride, payment, notification

## Database backups

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh
```

## Smoke tests

```bash
./scripts/smoke-test.sh
# Windows
./scripts/smoke-gateway.ps1
```

## Migrations

Prisma services run `prisma migrate deploy` on container start (see Dockerfiles).

# Seed compte restaurant demo + lien Chez Flore
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$compose = "$root\docker-compose.yml"

Write-Host "=== Migrations SQL ===" -ForegroundColor Cyan
Get-Content "$root\scripts\sql\restaurant-portal-auth.sql" | docker compose -f $compose exec -T postgres psql -U mova -d mova_auth
Get-Content "$root\scripts\sql\restaurant-portal-rides.sql" | docker compose -f $compose exec -T postgres psql -U mova -d mova_rides

Write-Host "=== Compte RESTAURANT +243900000030 ===" -ForegroundColor Cyan
Get-Content "$root\scripts\sql\seed-restaurant-user-auth.sql" | docker compose -f $compose exec -T postgres psql -U mova -d mova_auth

$userId = (docker compose -f $compose exec -T postgres psql -U mova -d mova_auth -t -A -c "SELECT id FROM users WHERE phone = '+243900000030' LIMIT 1;").Trim()
$linkSql = @"
UPDATE restaurants SET "ownerUserId" = '$userId' WHERE name = 'Chez Flore';
SELECT id, name, "ownerUserId" FROM restaurants WHERE name = 'Chez Flore';
"@
$linkSql | docker compose -f $compose exec -T postgres psql -U mova -d mova_rides

Write-Host "=== Rebuild ride-service (API portail) ===" -ForegroundColor Cyan
docker compose -f $compose up -d --build ride-service api-gateway notification-service

Write-Host "Done. Portail: cd restaurant && npm install && npm run dev -> http://localhost:3007" -ForegroundColor Green

# Seed données de test MOVA — SANS commandes (rides, livraisons, errands, paiements)
# Usage: .\scripts\seed-test-data.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $root "docker-compose.yml"
$pgHost = if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST } else { "localhost:54320" }
$base = "postgresql://mova:mova@${pgHost}"

Write-Host "=== Seed données de test (sans commandes) ===" -ForegroundColor Cyan

Write-Host "[1/6] Catalogue ride (restaurants, locations, tarifs)..." -ForegroundColor Yellow
Push-Location (Join-Path $root "services\ride-service")
try {
  $env:DATABASE_URL = "$base/mova_rides"
  npm exec -- prisma generate 2>$null | Out-Null
  npx ts-node prisma/seed.ts
} finally { Pop-Location }

Write-Host "[2/6] Utilisateurs démo auth..." -ForegroundColor Yellow
Push-Location (Join-Path $root "services\auth-service")
try {
  $env:DATABASE_URL = "$base/mova_auth"
  npm exec -- prisma generate 2>$null | Out-Null
  npx ts-node prisma/seed-demo.ts
} finally { Pop-Location }

Write-Host "[3/6] Chauffeurs, véhicules, KYC..." -ForegroundColor Yellow
$env:AUTH_SERVICE_URL = if ($env:AUTH_SERVICE_URL) { $env:AUTH_SERVICE_URL } else { "http://localhost:3011" }
$env:INTERNAL_API_KEY = if ($env:INTERNAL_API_KEY) { $env:INTERNAL_API_KEY } else { "mova-internal-dev" }
Push-Location (Join-Path $root "services\driver-service")
try {
  $env:DATABASE_URL = "$base/mova_drivers"
  npm exec -- prisma generate 2>$null | Out-Null
  npx ts-node prisma/seed-demo.ts
} finally { Pop-Location }

Write-Host "[4/6] Liens partenaires + portefeuilles..." -ForegroundColor Yellow
$restaurantUserId = (docker compose -f $compose exec -T postgres psql -U mova -d mova_auth -t -A -c "SELECT id FROM users WHERE phone = '+243900000030' LIMIT 1;").Trim()
$rentalUserId = (docker compose -f $compose exec -T postgres psql -U mova -d mova_auth -t -A -c "SELECT id FROM users WHERE phone = '+243900000031' LIMIT 1;").Trim()
if ($restaurantUserId) {
  "UPDATE restaurants SET `"ownerUserId`" = '$restaurantUserId' WHERE name = 'Chez Flore';" | docker compose -f $compose exec -T postgres psql -U mova -d mova_rides -q
}
if ($rentalUserId) {
  "UPDATE rental_vehicles SET `"ownerUserId`" = '$rentalUserId' WHERE name IN ('Toyota Corolla', 'Toyota RAV4');" | docker compose -f $compose exec -T postgres psql -U mova -d mova_rides -q
}
@"
INSERT INTO wallets (id, "userId", "balanceCdf", "heldBalanceCdf", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u.id, 50000, 0, NOW(), NOW()
FROM dblink('dbname=mova_auth user=mova password=mova host=postgres', 'SELECT id, role FROM users WHERE role IN (''PASSENGER'', ''DRIVER'')') AS u(id text, role text)
WHERE NOT EXISTS (SELECT 1 FROM wallets w WHERE w."userId" = u.id);
"@ | docker compose -f $compose exec -T postgres psql -U mova -d mova_payments -q 2>$null
if ($LASTEXITCODE -ne 0) {
  $passengerIds = docker compose -f $compose exec -T postgres psql -U mova -d mova_auth -t -A -c "SELECT id FROM users WHERE role IN ('PASSENGER', 'DRIVER');"
  foreach ($uid in ($passengerIds -split "`n" | Where-Object { $_.Trim() })) {
    $uid = $uid.Trim()
    if (-not $uid) { continue }
    "INSERT INTO wallets (id, `"userId`", `"balanceCdf`", `"heldBalanceCdf`", `"createdAt`", `"updatedAt`") SELECT gen_random_uuid()::text, '$uid', 50000, 0, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM wallets WHERE `"userId`" = '$uid');" | docker compose -f $compose exec -T postgres psql -U mova -d mova_payments -q
  }
}
"DELETE FROM rental_inquiries;" | docker compose -f $compose exec -T postgres psql -U mova -d mova_rides -q

Write-Host "[5/6] Publicités démo..." -ForegroundColor Yellow
Get-Content (Join-Path $PSScriptRoot "sql\seed-test-publicites.sql") | docker compose -f $compose exec -T postgres psql -U mova -d mova_rides -v ON_ERROR_STOP=1

Write-Host "[6/6] Lien restaurant portail..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "seed-restaurant.ps1")

Write-Host ""
Write-Host "=== Seed terminé ===" -ForegroundColor Green
Write-Host "Données: restaurants, véhicules location, chauffeurs/KYC, publicités, portefeuilles 50 000 FC"
Write-Host "Exclu: courses, livraisons, commandes, transactions"
Write-Host "Comptes: passagers 010-019, chauffeurs 020-029, restaurant 030, location 031 - OTP 123456"

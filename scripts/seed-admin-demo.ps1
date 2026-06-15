# Seed full admin demo dataset for MOVA dev dashboards
# Usage: .\scripts\seed-admin-demo.ps1
# Requires: Docker Postgres on localhost:5432 or DATABASE_URL env vars

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$pgHost = if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST } else { "localhost:54320" }
$base = "postgresql://mova:mova@${pgHost}"
$env:AUTH_DATABASE_URL = if ($env:AUTH_DATABASE_URL) { $env:AUTH_DATABASE_URL } else { "$base/mova_auth" }
$env:DRIVER_DATABASE_URL = if ($env:DRIVER_DATABASE_URL) { $env:DRIVER_DATABASE_URL } else { "$base/mova_drivers" }
$env:RIDE_DATABASE_URL = if ($env:RIDE_DATABASE_URL) { $env:RIDE_DATABASE_URL } else { "$base/mova_rides" }
$postgresContainer = if ($env:POSTGRES_CONTAINER) { $env:POSTGRES_CONTAINER } else { "mova-postgres-1" }

Write-Host "=== MOVA Admin Demo Seed ===" -ForegroundColor Cyan

Write-Host ""
Write-Host "[0/5] Prisma generate (auth, driver, ride) - optional..." -ForegroundColor Yellow
foreach ($svc in @("auth-service", "driver-service", "ride-service")) {
  Push-Location (Join-Path $root "services\$svc")
  try { npm exec -- prisma generate 2>$null | Out-Null } catch { Write-Host "  skip generate $svc" -ForegroundColor DarkGray }
  finally { Pop-Location }
}

Write-Host ""
Write-Host "[1/5] Admin user (+243900000001, SUPER_ADMIN)..." -ForegroundColor Yellow
$env:DATABASE_URL = $env:AUTH_DATABASE_URL
& "$PSScriptRoot\seed-admin.ps1"

Write-Host ""
Write-Host "[2/5] Grant ride DB schema (host access)..." -ForegroundColor Yellow
docker exec $postgresContainer psql -U mova -d mova_rides -c "GRANT ALL ON SCHEMA public TO mova; GRANT ALL ON ALL TABLES IN SCHEMA public TO mova;" 2>$null | Out-Null

Write-Host ""
Write-Host "[3/5] Ride catalog (auto-seeded in ride-service container)..." -ForegroundColor Yellow

Write-Host ""
Write-Host "[4/5] Demo users (auth) + drivers/KYC/incidents (driver)..." -ForegroundColor Yellow
Push-Location (Join-Path $root "services\auth-service")
try {
  $env:DATABASE_URL = $env:AUTH_DATABASE_URL
  npx ts-node prisma/seed-demo.ts
} finally { Pop-Location }

Push-Location (Join-Path $root "services\driver-service")
try {
  $env:DATABASE_URL = $env:DRIVER_DATABASE_URL
  npx ts-node prisma/seed-demo.ts
} finally { Pop-Location }

Write-Host ""
Write-Host "[5/5] Demo rides, deliveries, scheduled rides (SQL via Docker)..." -ForegroundColor Yellow
$sqlFile = Join-Path $PSScriptRoot "seed-ride-demo.sql"
Get-Content $sqlFile | docker exec -i $postgresContainer psql -U mova -d mova_rides -q 2>$null

Write-Host ""
Write-Host "=== Demo seed complete ===" -ForegroundColor Green
Write-Host 'Admin login:  phone +243900000001  OTP 123456  (role SUPER_ADMIN)'
Write-Host 'Demo users:   3 passengers (+243900000010-012), 4 drivers (+243900000020-023)'
Write-Host 'Dashboard:    3 KYC pending, 2 open incidents, 3 rides, 2 deliveries, 2 scheduled'
Write-Host 'Start admin:  cd admin; npm run dev on port 3002'

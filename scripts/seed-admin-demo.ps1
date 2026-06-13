# Seed full admin demo dataset for MOVA dev dashboards
# Usage: .\scripts\seed-admin-demo.ps1
# Requires: Docker Postgres on localhost (ports 5433-5437) or DATABASE_URL env vars

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$env:AUTH_DATABASE_URL = if ($env:AUTH_DATABASE_URL) { $env:AUTH_DATABASE_URL } else { "postgresql://mova:mova@localhost:5437/mova_auth" }
$env:DRIVER_DATABASE_URL = if ($env:DRIVER_DATABASE_URL) { $env:DRIVER_DATABASE_URL } else { "postgresql://mova:mova@localhost:5435/mova_drivers" }
$env:RIDE_DATABASE_URL = if ($env:RIDE_DATABASE_URL) { $env:RIDE_DATABASE_URL } else { "postgresql://mova:mova@localhost:5433/mova_rides" }

Write-Host "=== MOVA Admin Demo Seed ===" -ForegroundColor Cyan

Write-Host "`n[0/5] Prisma generate (auth, driver, ride)..." -ForegroundColor Yellow
foreach ($svc in @("auth-service", "driver-service", "ride-service")) {
  Push-Location (Join-Path $root "services\$svc")
  try { npm exec prisma generate 2>$null | Out-Null } finally { Pop-Location }
}

Write-Host "`n[1/5] Admin user (+243900000001, SUPER_ADMIN)..." -ForegroundColor Yellow
$env:DATABASE_URL = $env:AUTH_DATABASE_URL
& "$PSScriptRoot\seed-admin.ps1"

Write-Host "`n[2/5] Grant ride DB schema (host access)..." -ForegroundColor Yellow
docker exec mova-postgres-rides-1 psql -U mova -d mova_rides -c "GRANT ALL ON SCHEMA public TO mova; GRANT ALL ON ALL TABLES IN SCHEMA public TO mova;" 2>$null | Out-Null

Write-Host "`n[3/5] Ride catalog — skip host seed (auto-seeded in ride-service container)..." -ForegroundColor Yellow
Write-Host "  (communes/restaurants/pricing loaded at ride-service startup)" -ForegroundColor DarkGray

Write-Host "`n[4/5] Demo users (auth) + drivers/KYC/incidents (driver)..." -ForegroundColor Yellow
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

Write-Host "`n[5/5] Demo rides, deliveries, scheduled rides (SQL via Docker)..." -ForegroundColor Yellow
$sqlFile = Join-Path $PSScriptRoot "seed-ride-demo.sql"
Get-Content $sqlFile | docker exec -i mova-postgres-rides-1 psql -U mova -d mova_rides -q 2>$null

Write-Host "`n=== Demo seed complete ===" -ForegroundColor Green
Write-Host "Admin login:  phone +243900000001  OTP 123456  (role SUPER_ADMIN)"
Write-Host "Demo users:   3 passengers (+243900000010-012), 4 drivers (+243900000020-023)"
Write-Host "Dashboard:    3 KYC pending, 2 open incidents, 3 rides, 2 deliveries, 2 scheduled"
Write-Host "Start admin:  cd admin && npm run dev  ->  http://localhost:3002"

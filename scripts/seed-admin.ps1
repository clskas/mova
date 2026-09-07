# Seed admin user for MOVA dev (role ADMIN)
# Usage: .\scripts\seed-admin.ps1
# For full demo data also run: .\scripts\seed-admin-demo.ps1

$ErrorActionPreference = "Stop"

if ($env:NODE_ENV -eq "production" -or $env:APP_ENV -eq "production" -or $env:SKIP_DEMO_SEED -eq "true") {
  Write-Host "FORBIDDEN: skipping demo admin seed (production / SKIP_DEMO_SEED)."
  exit 0
}
if (-not $env:APP_ENV) { $env:APP_ENV = "development" }
if (-not $env:RUN_SEED) { $env:RUN_SEED = "true" }
$root = Split-Path -Parent $PSScriptRoot
$authDir = Join-Path $root "services\auth-service"

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = if ($env:AUTH_DATABASE_URL) { $env:AUTH_DATABASE_URL } else { "postgresql://mova:mova@localhost:54320/mova_auth" }
}

Write-Host "Seeding admin user (+243900000001) in auth DB ($($env:DATABASE_URL -replace ':[^:@]+@', ':***@'))..."

Push-Location $authDir
try {
  npx ts-node prisma/seed.ts
} finally {
  Pop-Location
}

Write-Host "Done. Login admin: phone +243900000001, OTP 123456 (MOCK_OTP=true)"

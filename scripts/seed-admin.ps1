# Seed admin user for MOVA dev (role ADMIN)
# Usage: .\scripts\seed-admin.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$authDir = Join-Path $root "services\auth-service"

Write-Host "Seeding admin user (+243900000001) in auth DB..."

Push-Location $authDir
try {
  if ($env:DATABASE_URL) {
    npx ts-node prisma/seed.ts
  } else {
    $env:DATABASE_URL = "postgresql://mova:mova@localhost:5437/mova_auth"
    npx ts-node prisma/seed.ts
  }
} finally {
  Pop-Location
}

Write-Host "Done. Login admin: phone +243900000001, OTP 123456 (MOCK_OTP=true)"

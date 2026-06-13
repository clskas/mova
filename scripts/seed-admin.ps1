# Seed admin user for MOVA dev (role ADMIN)
# Usage: .\scripts\seed-admin.ps1
# For full demo data also run: .\scripts\seed-admin-demo.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$authDir = Join-Path $root "services\auth-service"

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = if ($env:AUTH_DATABASE_URL) { $env:AUTH_DATABASE_URL } else { "postgresql://mova:mova@localhost:5437/mova_auth" }
}

Write-Host "Seeding admin user (+243900000001) in auth DB ($($env:DATABASE_URL -replace ':[^:@]+@', ':***@'))..."

Push-Location $authDir
try {
  npx ts-node prisma/seed.ts
} finally {
  Pop-Location
}

Write-Host "Done. Login admin: phone +243900000001, OTP 123456 (MOCK_OTP=true)"

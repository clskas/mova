# Seed comptes auth (admin + restaurant + partenaire location)
# Usage depuis la racine : npm run seed:auth
# Usage direct      : .\scripts\seed-auth.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$authDir = Join-Path $root "services\auth-service"

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = if ($env:AUTH_DATABASE_URL) { $env:AUTH_DATABASE_URL } else { "postgresql://mova:mova@localhost:54320/mova_auth" }
}

Write-Host "Seed auth DB ($($env:DATABASE_URL -replace ':[^:@]+@', ':***@'))..." -ForegroundColor Cyan

Push-Location $authDir
try {
  Write-Host "prisma generate..." -ForegroundColor DarkGray
  npx prisma generate
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npx prisma db seed
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Comptes créés / mis à jour :" -ForegroundColor Green
Write-Host "  Admin      +243900000001  OTP 123456"
Write-Host "  Restaurant +243900000030  OTP 123456"
Write-Host "  Location   +243900000031  OTP 123456  (portail http://localhost:3008)"

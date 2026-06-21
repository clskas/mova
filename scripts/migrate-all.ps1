# Applique les migrations Prisma sur les 5 bases (instance Postgres unique en local)
param(
  [string]$PostgresHost = "localhost:54320",
  [string]$PostgresUser = "mova",
  [string]$PostgresPassword = "mova"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

$baseUrl = "postgresql://${PostgresUser}:${PostgresPassword}@${PostgresHost}"
$databases = @{
  "services/auth-service"     = "$baseUrl/mova_auth"
  "services/ride-service"     = "$baseUrl/mova_rides"
  "services/payment-service"  = "$baseUrl/mova_payments"
  "services/driver-service"   = "$baseUrl/mova_drivers"
  "services/notification-service" = "$baseUrl/mova_notifications"
}

Write-Host "=== MOVA migrate:all (Postgres $PostgresHost) ===" -ForegroundColor Cyan

& "$PSScriptRoot\backup-db.ps1" -PostgresHost ($PostgresHost -replace ':.*','') -PostgresPort $(if ($PostgresHost -match ':(\d+)$') { $Matches[1] } else { '54320' })

foreach ($entry in $databases.GetEnumerator()) {
  $svcPath = $entry.Key
  $dbUrl = $entry.Value
  Write-Host ">>> $svcPath" -ForegroundColor Yellow
  $env:DATABASE_URL = $dbUrl
  npm run prisma:deploy --prefix $svcPath
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    exit $LASTEXITCODE
  }
}

Write-Host "=== Migrations OK ===" -ForegroundColor Green
Pop-Location

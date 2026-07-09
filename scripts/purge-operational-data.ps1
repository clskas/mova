# Purge all operational MOVA data except user accounts and reference config.
# Usage: .\scripts\purge-operational-data.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $root "docker-compose.yml"
$sql = Join-Path $PSScriptRoot "sql\purge-operational-data.sql"

if (-not (Test-Path $sql)) {
    Write-Error "SQL file not found: $sql"
}

Write-Host "=== Purge données opérationnelles (utilisateurs conservés) ===" -ForegroundColor Yellow
Write-Host "Conservé: users, communes/villes, tarifs, promos, abonnements (plans)" -ForegroundColor DarkGray

$userCount = docker compose -f $compose exec -T postgres psql -U mova -d mova_auth -t -A -c "SELECT count(*) FROM users;"
Write-Host "Utilisateurs avant purge: $($userCount.Trim())" -ForegroundColor Cyan

Get-Content $sql | docker compose -f $compose exec -T postgres psql -U mova -d mova_auth -v ON_ERROR_STOP=1

if ($LASTEXITCODE -ne 0) {
    Write-Error "Purge SQL failed"
}

docker compose -f $compose exec -T redis redis-cli FLUSHDB | Out-Null
Write-Host "Cache Redis vidé" -ForegroundColor DarkGray

$userCountAfter = docker compose -f $compose exec -T postgres psql -U mova -d mova_auth -t -A -c "SELECT count(*) FROM users;"
Write-Host "Utilisateurs après purge: $($userCountAfter.Trim())" -ForegroundColor Green
Write-Host "=== Purge terminée ===" -ForegroundColor Green

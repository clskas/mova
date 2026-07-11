# Purge all financial MOVA data and recreate empty wallets (balance 0).
# Usage: .\scripts\purge-financial-data.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $root "docker-compose.yml"
$sql = Join-Path $PSScriptRoot "sql\purge-financial-data.sql"
$platformUserId = "00000000-0000-4000-8000-mova00000001"

if (-not (Test-Path $sql)) {
    Write-Error "SQL file not found: $sql"
}

Write-Host "=== Purge données financières (comptes utilisateurs conservés) ===" -ForegroundColor Yellow
Write-Host "Supprime: portefeuilles, transactions, paiements, dettes, courses/livraisons/reservations" -ForegroundColor DarkGray
Write-Host "Conservé: utilisateurs, tarifs, commissions (%), plans d'abonnement" -ForegroundColor DarkGray

$walletCount = docker compose -f $compose exec -T postgres psql -U mova -d mova_payments -t -A -c "SELECT count(*) FROM wallets;"
Write-Host "Portefeuilles avant purge: $($walletCount.Trim())" -ForegroundColor Cyan

Get-Content $sql | docker compose -f $compose exec -T postgres psql -U mova -d mova_auth -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Purge SQL failed"
}

$userIds = docker compose -f $compose exec -T postgres psql -U mova -d mova_auth -t -A -c "SELECT id FROM users ORDER BY phone;"
$created = 0
foreach ($uid in ($userIds -split "`n" | Where-Object { $_.Trim() })) {
    $uid = $uid.Trim()
    if (-not $uid) { continue }
    @"
INSERT INTO wallets (id, "userId", "balanceCdf", "heldBalanceCdf", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, '$uid', 0, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM wallets WHERE "userId" = '$uid');
"@ | docker compose -f $compose exec -T postgres psql -U mova -d mova_payments -q
    $created++
}

@"
INSERT INTO wallets (id, "userId", "balanceCdf", "heldBalanceCdf", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, '$platformUserId', 0, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM wallets WHERE "userId" = '$platformUserId');
"@ | docker compose -f $compose exec -T postgres psql -U mova -d mova_payments -q

docker compose -f $compose exec -T redis redis-cli FLUSHDB | Out-Null
Write-Host "Cache Redis vide" -ForegroundColor DarkGray

$walletCountAfter = docker compose -f $compose exec -T postgres psql -U mova -d mova_payments -t -A -c "SELECT count(*) FROM wallets;"
$txCount = docker compose -f $compose exec -T postgres psql -U mova -d mova_payments -t -A -c "SELECT count(*) FROM wallet_transactions;"
$rideCount = docker compose -f $compose exec -T postgres psql -U mova -d mova_rides -t -A -c "SELECT count(*) FROM rides;"
Write-Host "Portefeuilles recrees (solde 0): $($walletCountAfter.Trim()) (+ tresorerie MOVA)" -ForegroundColor Green
Write-Host "Transactions: $($txCount.Trim()) | Courses: $($rideCount.Trim())" -ForegroundColor Green
Write-Host "=== Purge financiere terminee - pret pour tests de calcul ===" -ForegroundColor Green

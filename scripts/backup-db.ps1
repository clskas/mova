# Backup all MOVA PostgreSQL databases (Windows / local Docker).
param(
  [string]$PostgresHost = "localhost",
  [int]$PostgresPort = 54320,
  [string]$PostgresUser = "mova",
  [string]$PostgresPassword = "mova",
  [string]$BackupDir = "",
  [int]$RetentionDays = 14,
  [string]$BackupOnly = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $BackupDir) { $BackupDir = Join-Path $root "backups" }
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$databases = [ordered]@{
  auth          = @{ Name = "mova_auth";          Env = "DATABASE_URL_AUTH" }
  rides         = @{ Name = "mova_rides";         Env = "DATABASE_URL_RIDES" }
  payments      = @{ Name = "mova_payments";      Env = "DATABASE_URL_PAYMENTS" }
  drivers       = @{ Name = "mova_drivers";       Env = "DATABASE_URL_DRIVERS" }
  notifications = @{ Name = "mova_notifications"; Env = "DATABASE_URL_NOTIFICATIONS" }
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  Write-Error "pg_dump introuvable. Installez PostgreSQL client ou utilisez WSL."
}

$keys = if ($BackupOnly) { @($BackupOnly) } else { $databases.Keys }

Write-Host "=== MOVA DB backup ($timestamp) -> $BackupDir ===" -ForegroundColor Cyan

foreach ($key in $keys) {
  $info = $databases[$key]
  if (-not $info) { throw "BACKUP_ONLY inconnu: $key" }
  $envName = $info.Env
  $url = [Environment]::GetEnvironmentVariable($envName)
  if (-not $url) {
    $url = "postgresql://${PostgresUser}:${PostgresPassword}@${PostgresHost}:${PostgresPort}/$($info.Name)"
  }
  $out = Join-Path $BackupDir "mova_${key}_${timestamp}.sql"
  Write-Host "Backing up $key -> $out"
  & pg_dump $url --no-owner --no-acl -f $out
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed for $key" }
  $gz = "$out.gz"
  $bytes = [System.IO.File]::ReadAllBytes($out)
  $fs = [System.IO.File]::Create($gz)
  $gzip = New-Object System.IO.Compression.GZipStream($fs, [System.IO.Compression.CompressionMode]::Compress)
  $gzip.Write($bytes, 0, $bytes.Length)
  $gzip.Close()
  $fs.Close()
  Remove-Item $out -Force
  Write-Host "  -> $gz" -ForegroundColor Green
}

if ($RetentionDays -gt 0) {
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem $BackupDir -Filter "mova_*.sql.gz" -File |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object { Remove-Item $_.FullName -Force }
  Write-Host "Retention: fichiers > $RetentionDays jours supprimés" -ForegroundColor DarkGray
}

Write-Host "=== Backups complete ===" -ForegroundColor Green

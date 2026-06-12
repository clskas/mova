# Bootstrap MOVA microservices - creates directory structure
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$serviceDirs = @(
  "services/api-gateway",
  "services/auth-service",
  "services/ride-service",
  "services/payment-service",
  "services/driver-service",
  "services/notification-service",
  "services/admin-service",
  "packages/shared/src",
  "docker",
  "config"
)

foreach ($d in $serviceDirs) {
  New-Item -ItemType Directory -Force -Path (Join-Path $root $d) | Out-Null
}

Write-Host "Directories created under $root"

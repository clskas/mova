# MOVA — verification: health, flutter test, build web/admin
param(
  [string]$GatewayUrl = "http://localhost:3000",
  [switch]$SkipHealth,
  [switch]$SkipFlutter,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$failed = @()

function Step($name, [scriptblock]$action) {
  Write-Host ""
  Write-Host "=== $name ===" -ForegroundColor Cyan
  try {
    & $action
    Write-Host "OK: $name" -ForegroundColor Green
  } catch {
    Write-Host "FAIL: $name - $_" -ForegroundColor Red
    $script:failed += $name
  }
}

if (-not $SkipHealth) {
  Step "Gateway health ($GatewayUrl)" {
    $health = Invoke-RestMethod -Uri "$GatewayUrl/health" -Method Get -TimeoutSec 10
    $health | ConvertTo-Json -Depth 3
  }
}

if (-not $SkipFlutter) {
  Step "Flutter test (mobile)" {
    Push-Location (Join-Path $root "mobile")
    try {
      flutter test
      if ($LASTEXITCODE -ne 0) { throw "flutter test exit $LASTEXITCODE" }
    } finally {
      Pop-Location
    }
  }
}

if (-not $SkipBuild) {
  Step "npm run build (web)" {
    Push-Location (Join-Path $root "web")
    try {
      if (-not (Test-Path "node_modules")) { npm install }
      npm run build
      if ($LASTEXITCODE -ne 0) { throw "web build exit $LASTEXITCODE" }
    } finally {
      Pop-Location
    }
  }

  Step "npm run build (admin)" {
    Push-Location (Join-Path $root "admin")
    try {
      if (-not (Test-Path "node_modules")) { npm install }
      npm run build
      if ($LASTEXITCODE -ne 0) { throw "admin build exit $LASTEXITCODE" }
    } finally {
      Pop-Location
    }
  }
}

Write-Host ""
if ($failed.Count -eq 0) {
  Write-Host "=== ALL CHECKS PASSED ===" -ForegroundColor Green
  exit 0
} else {
  Write-Host "=== FAILED: $($failed -join ', ') ===" -ForegroundColor Red
  exit 1
}

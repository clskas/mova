# MOVA - smoke rapide : sante gateway + services, geo, estimation tarif
param(
  [string]$GatewayUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

function Test-Health($name, $url) {
  Write-Host "=== $name ===" -ForegroundColor Cyan
  try {
    $r = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 15 -UseBasicParsing
    Write-Host "OK ($($r.StatusCode))"
    return $true
  } catch {
    Write-Host "FAIL: $_" -ForegroundColor Red
    return $false
  }
}

$ok = $true

Write-Host "=== Gateway health + X-Request-Id ===" -ForegroundColor Cyan
$headers = @{ "X-Request-Id" = "smoke-test-$(Get-Date -Format 'yyyyMMddHHmmss')" }
try {
  $health = Invoke-WebRequest -Uri "$GatewayUrl/health" -Method Get -Headers $headers -UseBasicParsing
  $rid = $health.Headers["X-Request-Id"]
  if ($rid) {
    Write-Host "X-Request-Id: $rid" -ForegroundColor Green
  } else {
    Write-Host "WARN: X-Request-Id absent sur /health" -ForegroundColor Yellow
  }
  Write-Host $health.Content
} catch {
  Write-Error "Gateway unreachable at $GatewayUrl"
  exit 1
}

$directServices = @(
  @{ Name = "auth (docker 3011)"; Url = "http://localhost:3011/health" },
  @{ Name = "ride (docker 3022)"; Url = "http://localhost:3022/health" },
  @{ Name = "payment"; Url = "http://localhost:3003/health" },
  @{ Name = "driver"; Url = "http://localhost:3004/health" },
  @{ Name = "notification"; Url = "http://localhost:3005/health" },
  @{ Name = "admin"; Url = "http://localhost:3006/health" }
)

foreach ($svc in $directServices) {
  if (-not (Test-Health $svc.Name $svc.Url)) {
    $ok = $false
  }
}

Write-Host "=== Geo communes (ride via gateway) ===" -ForegroundColor Cyan
try {
  $geo = Invoke-RestMethod -Uri "$GatewayUrl/api/geo/communes?city=Kinshasa" -Method Get -Headers $headers
  $count = @($geo).Count
  Write-Host "OK - $count communes Kinshasa"
} catch {
  Write-Host "FAIL geo: $_" -ForegroundColor Red
  $ok = $false
}

Write-Host "=== Estimation course (pricing) ===" -ForegroundColor Cyan
$estimateBody = @{
  pickupLat = -4.3217
  pickupLng = 15.3125
  dropoffLat = -4.35
  dropoffLng = 15.34
  vehicleType = "STANDARD"
} | ConvertTo-Json
try {
  $est = Invoke-RestMethod -Uri "$GatewayUrl/api/rides/estimate" -Method Post -Body $estimateBody -ContentType "application/json" -Headers $headers
  $hasFare = ($null -ne $est.estimatedFareCdf) -or ($null -ne $est.fareCdf) -or ($null -ne $est.totalCdf)
  if ($hasFare) {
    Write-Host "OK - tarif estime retourne"
  } else {
    Write-Host "WARN: reponse sans montant CDF explicite" -ForegroundColor Yellow
  }
  $est | ConvertTo-Json -Depth 4
} catch {
  Write-Host "FAIL estimate (seed rides requis ?): $_" -ForegroundColor Red
  $ok = $false
}

if ($ok) {
  Write-Host "=== SMOKE ALL PASSED ===" -ForegroundColor Green
  exit 0
} else {
  Write-Host "=== SMOKE ALL FAILED ===" -ForegroundColor Red
  exit 1
}

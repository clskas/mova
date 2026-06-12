# MOVA gateway smoke test (PowerShell)
param(
  [string]$GatewayUrl = "http://localhost:3000"
)

Write-Host "=== Gateway health ===" -ForegroundColor Cyan
try {
  $health = Invoke-RestMethod -Uri "$GatewayUrl/health" -Method Get
  $health | ConvertTo-Json -Depth 5
} catch {
  Write-Error "Gateway unreachable at $GatewayUrl"
  exit 1
}

$services = @(
  @{ Name = "auth"; Port = 3001 },
  @{ Name = "ride"; Port = 3002 },
  @{ Name = "payment"; Port = 3003 },
  @{ Name = "driver"; Port = 3004 },
  @{ Name = "notification"; Port = 3005 },
  @{ Name = "admin"; Port = 3006 }
)

foreach ($svc in $services) {
  $url = "http://localhost:$($svc.Port)/health"
  Write-Host "=== $($svc.Name) $url ===" -ForegroundColor Cyan
  try {
    Invoke-RestMethod -Uri $url -Method Get | Out-Null
    Write-Host "OK"
  } catch {
    Write-Host "SKIP (not running)"
  }
}

Write-Host "=== OTP request (MOCK_OTP) ===" -ForegroundColor Cyan
$body = @{ phone = "+243812345678" } | ConvertTo-Json
try {
  $otp = Invoke-RestMethod -Uri "$GatewayUrl/api/auth/otp/request" -Method Post -Body $body -ContentType "application/json"
  $otp | ConvertTo-Json
} catch {
  Write-Warning "OTP request failed: $_"
}

Write-Host "Smoke test complete" -ForegroundColor Green

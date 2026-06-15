# Lancer l'app passager en debug sur appareil ou émulateur.
# Usage : .\scripts\run-mobile-passenger.ps1
#         .\scripts\run-mobile-passenger.ps1 -ApiUrl "http://10.0.2.2:3000/api" -WsUrl "http://10.0.2.2:3000"
#
# Ne jamais utiliser `flutter run` seul : le projet a des flavors (passenger, driver).

param(
    [string]$ApiUrl = "http://192.168.1.64:3000/api",
    [string]$WsUrl = "http://192.168.1.64:3000"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileDir = Join-Path $repoRoot "mobile"

$defines = @(
    "--dart-define=API_URL=$ApiUrl",
    "--dart-define=WS_URL=$WsUrl"
)

Push-Location $mobileDir
try {
    flutter pub get
    Write-Host "Running passenger (API_URL=$ApiUrl)..." -ForegroundColor Cyan
    flutter run --flavor passenger -t lib/main_passenger.dart @defines
}
finally {
    Pop-Location
}

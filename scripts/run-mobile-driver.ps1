# Lancer l'app chauffeur en debug sur appareil ou émulateur.
# Usage : .\scripts\run-mobile-driver.ps1
#         .\scripts\run-mobile-driver.ps1 -UsbReverse          # téléphone USB (contourne pare-feu LAN)
#         .\scripts\run-mobile-driver.ps1 -ApiUrl "http://10.0.2.2:3000/api" -WsUrl "http://10.0.2.2:3000"
#
# Ne jamais utiliser `flutter run` seul : le projet a des flavors (passenger, driver).

param(
    [string]$ApiUrl = "http://192.168.1.64:3000/api",
    [string]$WsUrl = "http://192.168.1.64:3000",
    [switch]$UsbReverse,
    [string]$Device = "R3CN70C59KF"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileDir = Join-Path $repoRoot "mobile"

if ($UsbReverse) {
    Write-Host "adb reverse tcp:3000 tcp:3000 (USB -> PC localhost:3000)" -ForegroundColor Yellow
    adb reverse tcp:3000 tcp:3000
    $ApiUrl = "http://127.0.0.1:3000/api"
    $WsUrl = "http://127.0.0.1:3000"
}

$defines = @(
    "--dart-define=API_URL=$ApiUrl",
    "--dart-define=WS_URL=$WsUrl"
)

Push-Location $mobileDir
try {
    flutter pub get
    Write-Host "Running driver (API_URL=$ApiUrl)..." -ForegroundColor Cyan
    if ($Device) {
        flutter run --flavor driver -t lib/main_driver.dart -d $Device @defines
    } else {
        flutter run --flavor driver -t lib/main_driver.dart @defines
    }
}
finally {
    Pop-Location
}

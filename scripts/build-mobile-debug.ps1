# Build debug APK passager + chauffeur pour tests sur appareil physique (LAN).
# Usage : .\scripts\build-mobile-debug.ps1
#         .\scripts\build-mobile-debug.ps1 -ApiUrl "http://192.168.1.10:3000/api"
#
# Sortie :
#   mobile/build/app/outputs/flutter-apk/app-passenger-debug.apk
#   mobile/build/app/outputs/flutter-apk/app-driver-debug.apk

param(
    [string]$ApiUrl = "",
    [string]$WsUrl = "",
    [switch]$UsbReverse
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileDir = Join-Path $repoRoot "mobile"
. (Join-Path $PSScriptRoot "mobile-api-url.ps1")

$urls = Get-MovaMobileApiUrls -ApiUrl $ApiUrl -WsUrl $WsUrl -UsbReverse:$UsbReverse
$ApiUrl = $urls.ApiUrl
$WsUrl = $urls.WsUrl

$defines = @(
    "--dart-define=API_URL=$ApiUrl",
    "--dart-define=WS_URL=$WsUrl"
)

Push-Location $mobileDir
try {
    flutter pub get

    $flavors = @(
        @{ Name = "passenger"; Target = "lib/main_passenger.dart" },
        @{ Name = "driver"; Target = "lib/main_driver.dart" }
    )

    foreach ($f in $flavors) {
        Write-Host "Building $($f.Name) debug APK (API_URL=$ApiUrl)..." -ForegroundColor Cyan
        flutter build apk --debug --flavor $f.Name -t $f.Target @defines
    }

    Write-Host ""
    Write-Host "APK debug générés :" -ForegroundColor Green
    Write-Host "  build/app/outputs/flutter-apk/app-passenger-debug.apk"
    Write-Host "  build/app/outputs/flutter-apk/app-driver-debug.apk"
    Write-Host ""
    Write-Host "Installation manuelle (choisir l'appareil) :" -ForegroundColor Yellow
    Write-Host "  adb devices"
    Write-Host "  adb -s <DEVICE_ID> install -r build/app/outputs/flutter-apk/app-passenger-debug.apk"
    Write-Host "  adb -s <DEVICE_ID> install -r build/app/outputs/flutter-apk/app-driver-debug.apk"
}
finally {
    Pop-Location
}

# Lancer l'app chauffeur en debug sur appareil ou émulateur.
# Usage : .\scripts\run-mobile-driver.ps1
#         .\scripts\run-mobile-driver.ps1 -UsbReverse
#         .\scripts\run-mobile-driver.ps1 -Device "emulator-5554"   # optionnel
#
# Sans -Device : détecte automatiquement le téléphone USB ou l'émulateur Android.
# Ne jamais utiliser `flutter run` seul : le projet a des flavors (passenger, driver).

param(
    [string]$ApiUrl = "",
    [string]$WsUrl = "",
    [switch]$UsbReverse,
    [string]$Device = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileDir = Join-Path $repoRoot "mobile"
. (Join-Path $PSScriptRoot "mobile-api-url.ps1")

if ($UsbReverse) {
    Write-Host "adb reverse tcp:3000 tcp:3000 (USB -> PC localhost:3000)" -ForegroundColor Yellow
    adb reverse tcp:3000 tcp:3000
}

$urls = Get-MovaMobileApiUrls -ApiUrl $ApiUrl -WsUrl $WsUrl -UsbReverse:$UsbReverse
$ApiUrl = $urls.ApiUrl
$WsUrl = $urls.WsUrl

$defines = @(
    "--dart-define=API_URL=$ApiUrl",
    "--dart-define=WS_URL=$WsUrl"
)

$deviceId = Get-MovaFlutterDevice -MobileDir $mobileDir -DeviceId $Device

Push-Location $mobileDir
try {
    flutter pub get
    Write-Host "Running driver on $deviceId" -ForegroundColor Cyan
    Write-Host "API_URL=$ApiUrl  (Wi-Fi/LAN — telephone et PC sur le meme reseau)" -ForegroundColor DarkGray
    flutter run --flavor driver -t lib/main_driver.dart -d $deviceId @defines
}
finally {
    Pop-Location
}

# Lancer l'app passager en debug sur appareil ou émulateur.
# Usage : .\scripts\run-mobile-passenger.ps1
#         .\scripts\run-mobile-passenger.ps1 -UsbReverse
#         .\scripts\run-mobile-passenger.ps1 -Device "emulator-5554"   # optionnel
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

$deviceId = Get-MovaFlutterDevice -MobileDir $mobileDir -DeviceId $Device

if ($UsbReverse) {
    Set-MovaAdbReverse -DeviceId $deviceId
}

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
    Write-Host "Running passenger on $deviceId" -ForegroundColor Cyan
    if ($UsbReverse) {
        Write-Host "API_URL=$ApiUrl  (USB reverse -> PC localhost:3000)" -ForegroundColor DarkGray
    } else {
        Write-Host "API_URL=$ApiUrl  (Wi-Fi/LAN, telephone et PC sur le meme reseau)" -ForegroundColor DarkGray
    }
    flutter run --flavor passenger -t lib/main_passenger.dart -d $deviceId @defines
}
finally {
    Pop-Location
}

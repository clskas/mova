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
    [string]$Device = "",
    [string]$DeviceName = "G981"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileDir = Join-Path $repoRoot "mobile"
. (Join-Path $PSScriptRoot "mobile-api-url.ps1")

$deviceId = if ($Device) {
    $Device
} elseif ($DeviceName) {
    Get-MovaFlutterDeviceByPattern -MobileDir $mobileDir -Pattern $DeviceName
} else {
    Get-MovaFlutterDevice -MobileDir $mobileDir -DeviceId $Device
}

if ($UsbReverse) {
    Set-MovaAdbReverse -DeviceId $deviceId
}

$urls = Get-MovaMobileApiUrls -ApiUrl $ApiUrl -WsUrl $WsUrl -UsbReverse:$UsbReverse -DeviceId $deviceId
$ApiUrl = $urls.ApiUrl
$WsUrl = $urls.WsUrl

$defines = @(
    "--dart-define=API_URL=$ApiUrl",
    "--dart-define=WS_URL=$WsUrl"
)
if ($urls.ApiFallbackUrl) {
    $defines += "--dart-define=API_FALLBACK_URL=$($urls.ApiFallbackUrl)"
}

Push-Location $mobileDir
try {
    flutter pub get
    Write-Host "Running passenger on $deviceId" -ForegroundColor Cyan
    if ($UsbReverse) {
        Write-Host "API_URL=$ApiUrl  WS_URL=$WsUrl" -ForegroundColor DarkGray
        if ($urls.ApiFallbackUrl) {
            Write-Host "API_FALLBACK_URL=$($urls.ApiFallbackUrl)" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "API_URL=$ApiUrl  (Wi-Fi/LAN, telephone et PC sur le meme reseau)" -ForegroundColor DarkGray
    }
    flutter run --flavor passenger -t lib/main_passenger.dart -d $deviceId @defines
}
finally {
    Pop-Location
}

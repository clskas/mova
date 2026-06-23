# Installe les APK debug et configure adb reverse (USB) si demandé.
# Usage :
#   .\scripts\install-mobile-debug.ps1 -Flavor passenger -Device R3CN70C59KF -UsbReverse
#   .\scripts\install-mobile-debug.ps1 -Flavor driver -Device V220206V01014 -UsbReverse

param(
    [ValidateSet("passenger", "driver", "both")]
    [string]$Flavor = "both",
    [string]$Device = "",
    [switch]$UsbReverse,
    [switch]$Launch
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileDir = Join-Path $repoRoot "mobile"
. (Join-Path $PSScriptRoot "mobile-api-url.ps1")

$deviceId = Get-MovaFlutterDevice -MobileDir $mobileDir -DeviceId $Device

if ($UsbReverse) {
    Set-MovaAdbReverse -DeviceId $deviceId
}

$packages = @()
if ($Flavor -eq "passenger" -or $Flavor -eq "both") {
    $packages += @{
        Apk = Join-Path $mobileDir "build/app/outputs/flutter-apk/app-passenger-debug.apk"
        Package = "cd.mova.mova.passenger"
        Activity = "cd.mova.mova.MainActivity"
        Label = "passenger"
    }
}
if ($Flavor -eq "driver" -or $Flavor -eq "both") {
    $packages += @{
        Apk = Join-Path $mobileDir "build/app/outputs/flutter-apk/app-driver-debug.apk"
        Package = "cd.mova.mova.driver"
        Activity = "cd.mova.mova.MainActivity"
        Label = "driver"
    }
}

foreach ($pkg in $packages) {
    if (-not (Test-Path $pkg.Apk)) {
        throw "APK manquant : $($pkg.Apk). Lancez d'abord .\scripts\build-mobile-debug.ps1$(if ($UsbReverse) { ' -UsbReverse' })."
    }
    Write-Host "Installation $($pkg.Label) sur $deviceId ..." -ForegroundColor Cyan
    & adb -s $deviceId install -r $pkg.Apk
    if ($LASTEXITCODE -ne 0) { throw "adb install a echoue pour $($pkg.Label)." }
    if ($Launch) {
        & adb -s $deviceId shell am start -n "$($pkg.Package)/$($pkg.Activity)"
    }
}

$urls = Get-MovaMobileApiUrls -UsbReverse:$UsbReverse
Write-Host "OK — API_URL=$($urls.ApiUrl)" -ForegroundColor Green
if ($UsbReverse) {
    Write-Host "adb reverse actif : le telephone utilise 127.0.0.1:3000 via USB." -ForegroundColor DarkGray
} else {
    Write-Host "Mode Wi-Fi : telephone et PC sur le meme reseau ($($urls.ApiUrl))." -ForegroundColor DarkGray
}

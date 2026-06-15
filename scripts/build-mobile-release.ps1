# Build local des AAB passager + chauffeur (parité CI mobile-release).
# Usage : .\scripts\build-mobile-release.ps1
#         .\scripts\build-mobile-release.ps1 -ApiUrl "https://api.mova.cd/api" -WsUrl "https://api.mova.cd"

param(
    [string]$ApiUrl = "https://api.mova.cd/api",
    [string]$WsUrl = "https://api.mova.cd"
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

    $flavors = @(
        @{ Name = "passenger"; Target = "lib/main_passenger.dart" },
        @{ Name = "driver"; Target = "lib/main_driver.dart" }
    )

    foreach ($f in $flavors) {
        Write-Host "Building $($f.Name) AAB..." -ForegroundColor Cyan
        flutter build appbundle --release --flavor $f.Name -t $f.Target @defines
    }

    Write-Host ""
    Write-Host "AAB générés :" -ForegroundColor Green
    Write-Host "  build/app/outputs/bundle/passengerRelease/app-passenger-release.aab"
    Write-Host "  build/app/outputs/bundle/driverRelease/app-driver-release.aab"
}
finally {
    Pop-Location
}

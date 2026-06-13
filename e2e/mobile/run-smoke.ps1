# Smoke test Appium — Windows PowerShell
# Usage: npm run test:mobile:ps1   (depuis e2e/)
# Prérequis: Appium démarré (npm run appium:start), adb devices OK

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$E2eRoot = Split-Path -Parent $ScriptDir

# Charger .env si présent
$EnvFile = Join-Path $E2eRoot ".env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
        }
    }
}

Write-Host "=== MOVA — smoke test mobile (Appium) ===" -ForegroundColor Cyan

# Vérifier adb
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    Write-Warning "adb introuvable. Définissez ANDROID_HOME et ajoutez platform-tools au PATH."
    Write-Host "  Ex: `$env:ANDROID_HOME = 'C:\Users\<vous>\AppData\Local\Android\Sdk'"
    exit 1
}

$devices = adb devices | Select-String "device$"
if (-not $devices) {
    Write-Error "Aucun appareil Android détecté. Branchez SM G981V ou lancez un émulateur, puis: adb devices"
}

Write-Host "Appareils:" ($devices -join ", ")

# Vérifier Appium (port par défaut 4723)
$appiumPort = if ($env:APPIUM_PORT) { $env:APPIUM_PORT } else { "4723" }
try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$appiumPort/status" -TimeoutSec 3 -UseBasicParsing | Out-Null
} catch {
    Write-Error "Appium ne répond pas sur le port $appiumPort. Lancez dans un autre terminal: npm run appium:start"
}

Push-Location $E2eRoot
try {
    node mobile/run-smoke.mjs
} finally {
    Pop-Location
}

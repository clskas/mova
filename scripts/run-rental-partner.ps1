# Lancer le portail partenaire location (PWA) — port 3008
# Usage : .\scripts\run-rental-partner.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot "rental-partner"

Push-Location $appDir
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "npm install..." -ForegroundColor Yellow
        npm install
    }
    if (-not (Test-Path ".env.local")) {
        Copy-Item ".env.example" ".env.local"
        Write-Host "Created .env.local from .env.example" -ForegroundColor Yellow
    }
    Write-Host "Portail partenaire location → http://localhost:3008" -ForegroundColor Cyan
    npm run dev
}
finally {
    Pop-Location
}

# Sync manuel passager (docs → mobile in-app)
$src = Join-Path $PSScriptRoot "..\docs\user-manual\passager.md"
$dst = Join-Path $PSScriptRoot "..\mobile\assets\legal\manuel_fr.md"
$content = Get-Content $src -Raw -Encoding UTF8
$content = $content -replace '^# MOVA Passager', '# Manuel utilisateur — MOVA Passager'
$content = $content -replace '(?s)## Mode hors-ligne.*$', ''
$header = "<!-- Source: docs/user-manual/passager.md — modifier docs/ puis exécuter scripts/sync-user-manual.ps1 -->`n`n"
Set-Content -Path $dst -Value ($header + $content.TrimEnd()) -Encoding UTF8 -NoNewline
Write-Host "Synced $dst from $src"

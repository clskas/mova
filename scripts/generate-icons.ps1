# Generate MOVA icon derivatives from movaicone.png
param(
    [string]$Source = "$PSScriptRoot\..\mobile\assets\icon\movaicone.png"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Source)) {
    $alt = "$env:USERPROFILE\Downloads\movaicone.png"
    if (Test-Path $alt) { Copy-Item $alt $Source -Force }
    else { throw "Source icon not found: $Source" }
}

function Resize-Icon {
    param([string]$OutPath, [int]$Size)
    $dir = Split-Path $OutPath -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $src = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
    try {
        $bmp = New-Object System.Drawing.Bitmap $Size, $Size
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.Clear([System.Drawing.Color]::Transparent)
            $g.DrawImage($src, 0, 0, $Size, $Size)
        } finally { $g.Dispose() }
        $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $src.Dispose()
        if ($bmp) { $bmp.Dispose() }
    }
    Write-Host "Created $OutPath ($Size x $Size)"
}

$root = Split-Path $PSScriptRoot -Parent

Resize-Icon "$root\web\public\icon-192.png" 192
Resize-Icon "$root\web\public\icon-512.png" 512
Resize-Icon "$root\web\public\favicon.png" 32
Copy-Item "$root\web\public\favicon.png" "$root\web\public\favicon.ico" -Force
Write-Host "Created web/public/favicon.ico"
Copy-Item "$root\web\public\favicon.png" "$root\admin\src\app\icon.png" -Force
Write-Host "Created admin/src/app/icon.png"
$adminPublic = "$root\admin\public"
if (-not (Test-Path $adminPublic)) { New-Item -ItemType Directory -Path $adminPublic -Force | Out-Null }
Copy-Item "$root\web\public\icon-192.png" "$adminPublic\icon.png" -Force
Write-Host "Created admin/public/icon.png"
Resize-Icon "$root\mobile\android\app\src\main\res\drawable\splash_icon.png" 192
Write-Host "Icon generation complete."

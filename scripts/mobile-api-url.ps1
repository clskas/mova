# Détecte l'IP LAN du PC pour les apps Flutter (--dart-define=API_URL).
function Get-MovaLanIp {
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*')
        } |
        Sort-Object -Property InterfaceMetric, IPAddress

    if (-not $candidates -or $candidates.Count -eq 0) {
        $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -notlike '127.*' -and
                $_.IPAddress -notlike '169.254.*' -and
                $_.IPAddress -like '172.1*' -and
                $_.InterfaceAlias -notlike '*WSL*' -and
                $_.InterfaceAlias -notlike '*Hyper-V*' -and
                $_.InterfaceAlias -notlike '*Default Switch*'
            } |
            Sort-Object -Property InterfaceMetric, IPAddress
    }

    $wifiFirst = @($candidates | Where-Object {
        $_.InterfaceAlias -match 'Wi-?Fi|WLAN|Ethernet|LAN' -and
        $_.InterfaceAlias -notmatch 'WSL|Hyper-V|Virtual|VMware|VirtualBox'
    })
    if ($wifiFirst.Count -gt 0) {
        return $wifiFirst[0].IPAddress
    }

    if ($candidates) {
        return $candidates[0].IPAddress
    }
    return '192.168.1.64'
}

function Set-MovaAdbReverse {
    param([string]$DeviceId = "")

    $adbArgs = @('reverse', 'tcp:3000', 'tcp:3000')
    $allIds = @(adb devices 2>$null |
        Where-Object { $_ -match '\tdevice$' } |
        ForEach-Object { ($_ -split '\t')[0].Trim() } |
        Where-Object { $_ })

    if ($allIds.Count -eq 0) {
        throw "adb reverse impossible : aucun telephone connecte (adb devices)."
    }

    foreach ($id in $allIds) {
        Write-Host "adb -s $id reverse tcp:3000 tcp:3000 (USB -> PC localhost:3000)" -ForegroundColor Yellow
        & adb -s $id @adbArgs
        if ($LASTEXITCODE -ne 0) {
            throw "adb reverse a echoue pour $id. Verifiez adb devices et le debogage USB."
        }
    }

    if ($DeviceId -and $allIds -notcontains $DeviceId) {
        Write-Host "Attention : -Device $DeviceId n'est pas dans adb devices." -ForegroundColor Yellow
    }
}

function Get-MovaMobileApiUrls {
    param(
        [string]$ApiUrl,
        [string]$WsUrl,
        [switch]$UsbReverse
    )

    if ($UsbReverse) {
        return @{
            ApiUrl = 'http://127.0.0.1:3000/api'
            WsUrl  = 'http://127.0.0.1:3000'
        }
    }

    if (-not $ApiUrl) {
        $ip = Get-MovaLanIp
        $ApiUrl = "http://${ip}:3000/api"
    }
    if (-not $WsUrl) {
        if ($ApiUrl -match '^(https?://[^/]+)') {
            $WsUrl = $Matches[1]
        } else {
            $WsUrl = "http://$(Get-MovaLanIp):3000"
        }
    }

    return @{ ApiUrl = $ApiUrl; WsUrl = $WsUrl }
}

# Sélectionne automatiquement un téléphone/émulateur Android ou iOS (ignore Windows/Chrome).
function Get-MovaFlutterDevice {
    param(
        [Parameter(Mandatory = $true)][string]$MobileDir,
        [string]$DeviceId = ""
    )

    if ($DeviceId) {
        return $DeviceId
    }

    Push-Location $MobileDir
    try {
        $devices = @(flutter devices --machine 2>$null | ConvertFrom-Json)
    } finally {
        Pop-Location
    }

    if ($devices.Count -eq 0) {
        throw 'Aucun appareil Flutter detecte. Branchez un telephone (USB) ou lancez un emulateur Android.'
    }

    $mobile = @($devices | Where-Object {
        $_.isSupported -and ($_.targetPlatform -like 'android*' -or $_.targetPlatform -like 'ios*')
    })

    $physical = @($mobile | Where-Object { -not $_.emulator })
    if ($physical.Count -eq 1) {
        return $physical[0].id
    }
    if ($physical.Count -gt 1) {
        Write-Host 'Plusieurs telephones — premier utilise :' -ForegroundColor Yellow
        $physical | ForEach-Object { Write-Host "  $($_.id)  $($_.name)" }
        return $physical[0].id
    }

    $emulators = @($mobile | Where-Object { $_.emulator })
    if ($emulators.Count -ge 1) {
        return $emulators[0].id
    }

    throw @'
Aucun telephone Android/iOS detecte par Flutter.

1. Branchez le telephone en USB (ou activez le debogage sans fil).
2. Sur le telephone : Options developpeur > Debogage USB ON, acceptez la cle RSA du PC.
3. Verifiez : adb devices  puis  flutter devices

Note : mode Wi-Fi (sans -UsbReverse) utilise l IP du PC sur le Wi-Fi pour l API,
mais il faut quand meme un telephone connecte pour installer/lancer l app.
'@
}

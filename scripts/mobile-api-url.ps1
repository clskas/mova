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

function Test-MovaDeviceGateway {
    param(
        [Parameter(Mandatory = $true)][string]$DeviceId,
        [Parameter(Mandatory = $true)][string]$GatewayBase
    )

    if (-not $DeviceId) { return $false }

    $adbCmd = "curl -s -m 5 -o /dev/null -w '%{http_code}' ${GatewayBase}/health"
    $job = Start-Job -ScriptBlock {
        param($id, $cmd)
        & adb -s $id shell $cmd 2>$null
    } -ArgumentList $DeviceId, $adbCmd
    $done = Wait-Job $job -Timeout 12
    if (-not $done) {
        Stop-Job $job -Force -ErrorAction SilentlyContinue
        Remove-Job $job -Force -ErrorAction SilentlyContinue
        return $false
    }
    $code = (Receive-Job $job).Trim()
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    return "$code" -eq '200'
}

function Set-MovaAdbReverse {
    param([string]$DeviceId = "")

    $adbArgs = @('reverse', 'tcp:3000', 'tcp:3000')
    $targetIds = if ($DeviceId) { @($DeviceId) } else {
        @(adb devices 2>$null |
            Where-Object { $_ -match '\tdevice$' } |
            ForEach-Object { ($_ -split '\t')[0].Trim() } |
            Where-Object { $_ })
    }

    if ($targetIds.Count -eq 0) {
        throw "adb reverse impossible : aucun telephone connecte (adb devices)."
    }

    foreach ($id in $targetIds) {
        Write-Host "adb -s $id reverse tcp:3000 tcp:3000 (USB -> PC localhost:3000)" -ForegroundColor Yellow
        & adb -s $id @adbArgs
        if ($LASTEXITCODE -ne 0) {
            throw "adb reverse a echoue pour $id. Verifiez adb devices et le debogage USB."
        }
    }
}

function Get-MovaMobileApiUrls {
    param(
        [string]$ApiUrl,
        [string]$WsUrl,
        [switch]$UsbReverse,
        [string]$DeviceId = ""
    )

    $lanIp = Get-MovaLanIp
    $lanApiUrl = "http://${lanIp}:3000/api"
    $lanWsUrl = "http://${lanIp}:3000"

    if ($UsbReverse) {
        # Ne pas bloquer sur curl via adb shell (souvent lent / absent sur l'appareil).
        return @{
            ApiUrl           = 'http://127.0.0.1:3000/api'
            WsUrl            = 'http://127.0.0.1:3000'
            ApiFallbackUrl   = $lanApiUrl
        }
    }

    if (-not $ApiUrl) {
        $ApiUrl = $lanApiUrl
    }
    if (-not $WsUrl) {
        if ($ApiUrl -match '^(https?://[^/]+)') {
            $WsUrl = $Matches[1]
        } else {
            $WsUrl = $lanWsUrl
        }
    }

    return @{ ApiUrl = $ApiUrl; WsUrl = $WsUrl; ApiFallbackUrl = '' }
}

function Get-MovaFlutterDeviceByPattern {
    param(
        [Parameter(Mandatory = $true)][string]$MobileDir,
        [Parameter(Mandatory = $true)][string]$Pattern
    )

    Push-Location $MobileDir
    try {
        $devices = @(flutter devices --machine 2>$null | ConvertFrom-Json)
    } finally {
        Pop-Location
    }

    $match = @($devices | Where-Object {
        $_.isSupported -and ($_.name -like "*$Pattern*" -or $_.id -like "*$Pattern*")
    })
    if ($match.Count -eq 0) {
        throw "Aucun appareil correspondant a $Pattern. Lancez flutter devices."
    }
    if ($match.Count -gt 1) {
        Write-Host "Plusieurs appareils pour $Pattern - premier utilise :" -ForegroundColor Yellow
        $match | ForEach-Object { Write-Host "  $($_.id)  $($_.name)" }
    }
    return $match[0].id
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
        Write-Host "Plusieurs telephones - premier utilise :" -ForegroundColor Yellow
        $physical | ForEach-Object { Write-Host "  $($_.id)  $($_.name)" }
        return $physical[0].id
    }

    $emulators = @($mobile | Where-Object { $_.emulator })
    if ($emulators.Count -ge 1) {
        return $emulators[0].id
    }

    throw "Aucun telephone Android/iOS detecte. Branchez un telephone USB, activez le debogage USB, puis verifiez adb devices et flutter devices."
}

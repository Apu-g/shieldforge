# ShieldForge Windows PowerShell Service Starter
# Run: .\start-all.ps1
# Stop: .\stop-all.ps1

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  ShieldForge - Starting All Services     " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$RootDir = $PSScriptRoot
$LogDir = Join-Path $RootDir "logs"
if (!(Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# Stop any running instances first
& "$RootDir\stop-all.ps1" | Out-Null

$Processes = @()

function Start-ServiceProcess {
    param(
        [string]$Name,
        [string]$WorkingDir,
        [string]$RelativeScript,
        [string[]]$ArgsList,
        [string]$HealthUrl,
        [int]$Port
    )

    $time = (Get-Date -Format 'HH:mm:ss')
    Write-Host "[$time] Starting $Name on port $Port..." -ForegroundColor Yellow
    $LogFile = Join-Path $LogDir "$Name.log"
    "" | Set-Content $LogFile -Force

    $proc = Start-Process -FilePath "node" `
        -ArgumentList (@($RelativeScript) + $ArgsList) `
        -WorkingDirectory $WorkingDir `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError (Join-Path $LogDir "$Name.err.log") `
        -WindowStyle Hidden `
        -PassThru

    $started = $false
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Milliseconds 600
        try {
            $resp = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($resp -and $resp.StatusCode -lt 500) {
                $started = $true
                break
            }
        } catch {
            # Still warming up
        }
    }

    $timeDone = (Get-Date -Format 'HH:mm:ss')
    if ($started) {
        Write-Host "[$timeDone] [OK] $Name started (PID: $($proc.Id)) -> $HealthUrl" -ForegroundColor Green
    } else {
        Write-Host "[$timeDone] [WARN] $Name launched with PID $($proc.Id) (check logs\$Name.err.log)" -ForegroundColor DarkYellow
    }

    return [PSCustomObject]@{
        Name = $Name
        PID  = $proc.Id
        Port = $Port
        Url  = $HealthUrl
    }
}

# 1. Reverse Proxy (Port 3000)
$proxyDir = Join-Path $RootDir "proxy\proxy"
$p1 = Start-ServiceProcess -Name "proxy" `
    -WorkingDir $proxyDir `
    -RelativeScript "node_modules/next/dist/bin/next" `
    -ArgsList @("start", "-p", "3000") `
    -HealthUrl "http://localhost:3000/t/aisummit/" `
    -Port 3000
$Processes += $p1

# 2. Security Dashboard (Port 3003)
$dashDir = Join-Path $RootDir "dashboard"
$p2 = Start-ServiceProcess -Name "dashboard" `
    -WorkingDir $dashDir `
    -RelativeScript "node_modules/next/dist/bin/next" `
    -ArgsList @("start", "-p", "3003") `
    -HealthUrl "http://localhost:3003/api/health" `
    -Port 3003
$Processes += $p2

# 3. LLM Explanation Agent (Port 3002)
$llmDir = Join-Path $RootDir "llm-agent"
$p3 = Start-ServiceProcess -Name "llm-agent" `
    -WorkingDir $llmDir `
    -RelativeScript "node_modules/next/dist/bin/next" `
    -ArgsList @("start", "-p", "3002") `
    -HealthUrl "http://localhost:3002/" `
    -Port 3002
$Processes += $p3

# 4. Background LLM Poller (runs /api/poll every 5s)
$pollerCmd = "while (`$true) { try { Invoke-RestMethod -Uri 'http://localhost:3002/api/poll' -Method Post -TimeoutSec 10 | Out-Null } catch {}; Start-Sleep -Seconds 5 }"
$pollerProc = Start-Process -FilePath "powershell" `
    -ArgumentList @("-NoProfile", "-Command", $pollerCmd) `
    -WindowStyle Hidden `
    -PassThru
$Processes += [PSCustomObject]@{
    Name = "llm-poller"
    PID  = $pollerProc.Id
    Port = 0
    Url  = "background-poller"
}

# Save PIDs to file for stop-all.ps1
$pidFile = Join-Path $LogDir "pids.json"
$Processes | ConvertTo-Json | Set-Content $pidFile -Force

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  ShieldForge Services Running!           " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Proxied IEEE Website : http://localhost:3000/t/aisummit/" -ForegroundColor Cyan
Write-Host "  Security Dashboard   : http://localhost:3003/" -ForegroundColor Cyan
Write-Host "  Attack Test (XSS)    : curl http://localhost:3000/t/aisummit/?q=<script>alert(1)</script>" -ForegroundColor Yellow
Write-Host "  Attack Test (SQLi)   : curl http://localhost:3000/t/aisummit/?id=1+union+select+1,2" -ForegroundColor Yellow
Write-Host "  Stop Services        : .\stop-all.ps1" -ForegroundColor Gray
Write-Host "==========================================" -ForegroundColor Green

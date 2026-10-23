# ShieldForge Windows PowerShell Service Stopper
# Run: .\stop-all.ps1

Write-Host "Stopping ShieldForge services..." -ForegroundColor Yellow

$LogDir = Join-Path $PSScriptRoot "logs"
$pidFile = Join-Path $LogDir "pids.json"

if (Test-Path $pidFile) {
    try {
        $processes = Get-Content $pidFile -Raw | ConvertFrom-Json
        foreach ($proc in $processes) {
            try {
                Stop-Process -Id $proc.PID -Force -ErrorAction SilentlyContinue
                Write-Host "Stopped $($proc.Name) (PID $($proc.PID))" -ForegroundColor Green
            } catch {}
        }
    } catch {}
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# Kill any leftover listeners on ports 3000, 3001, 3002, 3003, 8000
$ports = @(3000, 3001, 3002, 3003, 8000)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($p in $pids) {
            if ($p -and $p -ne 0) {
                Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
                Write-Host "Killed process on port $port (PID: $p)" -ForegroundColor Green
            }
        }
    }
}

Write-Host "All ShieldForge services stopped." -ForegroundColor Green

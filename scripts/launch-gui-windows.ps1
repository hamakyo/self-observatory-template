$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host 'uv is required. See README.md for setup instructions.'
    exit 1
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host 'pnpm is required. See README.md for setup instructions.'
    exit 1
}

if (-not (Test-Path 'node_modules')) {
    & pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& uv sync --locked --extra dev
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& uv run self-observatory index --rebuild
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$port = $null
for ($candidate = 8000; $candidate -le 8099; $candidate++) {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $candidate)
    $available = $true
    try {
        $listener.Start()
    }
    catch {
        $available = $false
    }
    if ($available) {
        $listener.Stop()
        $port = $candidate
        break
    }
}
if ($null -eq $port) {
    Write-Host 'No available port found in 8000-8099.'
    exit 1
}

$url = 'http://127.0.0.1:' + $port
Write-Host "Starting Self Observatory at $url -- press Ctrl-C to stop."
Start-Job -ArgumentList $url -ScriptBlock {
    param($targetUrl)
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $response = Invoke-RestMethod -Uri ($targetUrl + '/api/repository') -TimeoutSec 2
            if ($response.index_state -eq 'ready') {
                Start-Process $targetUrl
                return
            }
        }
        catch { }
        Start-Sleep -Seconds 1
    }
    Write-Error 'Failed to confirm local API startup.'
} | Out-Null

& uv run self-observatory serve --port $port --ui-dir apps/observatory/dist
exit $LASTEXITCODE

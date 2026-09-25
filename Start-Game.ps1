$ErrorActionPreference = 'Stop'
$raceProject = $PSScriptRoot
$raceNode = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $raceNode) { throw 'Node.js 20.19+ is required. Install Node.js and run this launcher again.' }
$raceAddress = 'http://127.0.0.1:4180'
$raceReady = $false
try {
    $raceHealth = Invoke-RestMethod -Uri ($raceAddress + '/health') -TimeoutSec 2
    $raceReady = $raceHealth.app -eq 'afterlight-coastline'
} catch { }
if (-not $raceReady) {
    if (-not (Test-Path -LiteralPath (Join-Path $raceProject 'dist\index.html'))) {
        Push-Location -LiteralPath $raceProject
        try {
            if (-not (Test-Path -LiteralPath 'node_modules\vite')) {
                & npm.cmd ci
                if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
            }
            & npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw 'Game build failed.' }
        } finally { Pop-Location }
    }
    $raceLogDir = Join-Path $raceProject '.runtime'
    New-Item -ItemType Directory -Force -Path $raceLogDir | Out-Null
    $raceScript = Join-Path $raceProject 'scripts\serve.mjs'
    Start-Process -FilePath $raceNode.Source -ArgumentList ('"' + $raceScript + '"') -WorkingDirectory $raceProject -WindowStyle Hidden -RedirectStandardOutput (Join-Path $raceLogDir 'server.log') -RedirectStandardError (Join-Path $raceLogDir 'server-error.log') | Out-Null
    for ($raceAttempt = 0; $raceAttempt -lt 25; $raceAttempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $raceHealth = Invoke-RestMethod -Uri ($raceAddress + '/health') -TimeoutSec 1
            if ($raceHealth.app -eq 'afterlight-coastline') { $raceReady = $true; break }
        } catch { }
    }
    if (-not $raceReady) { throw 'The local game server did not start. Check .runtime/server-error.log.' }
}
Start-Process $raceAddress

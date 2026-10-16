$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-Location -LiteralPath $PSScriptRoot
$siteUrl = 'http://localhost:3000'
function Test-SiteReady {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000' -UseBasicParsing -TimeoutSec 5
        return $response.StatusCode -eq 200 -and $response.Content.Contains('Social Downloader</title>')
    } catch { return $false }
}
if (-not (Test-SiteReady)) {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $serverProcess = Start-Process -FilePath $nodePath -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'server-output.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server-error.log') -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-SiteReady) { $ready = $true; break }
        if ($serverProcess.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) {
        Write-Host 'The website could not start. Server details:'
        Get-Content -LiteralPath (Join-Path $PSScriptRoot 'server-error.log') -ErrorAction SilentlyContinue
        exit 1
    }
}
Start-Process $siteUrl
Write-Host 'Drop is running at http://localhost:3000. You can close this launcher.'


$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-Location -LiteralPath $PSScriptRoot
New-Item -ItemType Directory -Force -Path 'bin' | Out-Null
Write-Host 'Downloading yt-dlp from its official GitHub release...'
Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile 'bin/yt-dlp.download'
Invoke-WebRequest -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS' -OutFile 'bin/SHA2-256SUMS'
$expected = (Get-Content 'bin/SHA2-256SUMS' | Where-Object { $_ -match '\s+yt-dlp\.exe$' }).Split(' ')[0]
$actual = (Get-FileHash 'bin/yt-dlp.download' -Algorithm SHA256).Hash
if ($actual -ne $expected) { throw 'Download checksum did not match. Please run setup again.' }
Move-Item -LiteralPath (Join-Path $PSScriptRoot 'bin/yt-dlp.download') -Destination (Join-Path $PSScriptRoot 'bin/yt-dlp.exe') -Force
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or newer from https://nodejs.org and run setup again.' }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'Install FFmpeg with: winget install Gyan.FFmpeg ; then reopen the terminal.' }
& '.\bin\yt-dlp.exe' --version
Write-Host 'Setup complete. Double-click start.bat to open the website.'

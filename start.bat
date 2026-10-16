@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22 or newer from https://nodejs.org first.
 pause
 exit /b 1
)
if not exist "bin\yt-dlp.exe" (
 powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"
if errorlevel 1 pause

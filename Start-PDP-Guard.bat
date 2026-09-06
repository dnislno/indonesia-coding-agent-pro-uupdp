@echo off
REM PDP Guard - klik 2x untuk jalan. First run: install kebutuhan otomatis.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22+ belum ada. Mencoba install via winget...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo Install manual: https://nodejs.org lalu klik file ini lagi.
    pause
    exit /b 1
  )
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
  where node >nul 2>nul
  if errorlevel 1 (
    echo Restart terminal/komputer bila PATH belum kebaca, lalu klik lagi.
    pause
    exit /b 1
  )
)
if not exist "pdp\llama-bin\llama-server.exe" (
  echo First run: mengunduh llama.cpp + model lokal...
  powershell -ExecutionPolicy Bypass -File "pdp\setup-llama.ps1"
  if errorlevel 1 (
    echo Setup gagal. Cek koneksi internet lalu klik lagi.
    pause
    exit /b 1
  )
)
start "PDP Guard" /min node packages\pdp-proxy\src\server.ts
timeout /t 4 /nobreak >nul
start http://127.0.0.1:11480/

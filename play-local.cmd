@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
node tools\local-play\one-click.mjs
if errorlevel 1 (
  echo.
  echo Local play did not start. See the error above.
  pause
  exit /b 1
)

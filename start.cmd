@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing StateCraft. This takes a minute the first time...
  call npm install
  if errorlevel 1 (
    echo Install failed. See the messages above.
    pause
    exit /b 1
  )
)
echo Starting StateCraft...
call npm start
pause

@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Second Brain
echo.
echo  ==== Second Brain - local launcher ====
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [x] Node.js was not found. Install Node 22 LTS from https://nodejs.org and run this again.
  pause
  exit /b 1
)
for /f "delims=" %%v in (node -v) do echo [ok] Node %%v

where docker >nul 2>nul
if errorlevel 1 (
  echo [x] Docker was not found. Install Docker Desktop and run this again.
  pause
  exit /b 1
)

docker info >nul 2>nul
if not errorlevel 1 goto docker_ready
echo [..] Starting Docker Desktop (first start can take a minute)...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a tries=0
:wait_docker
timeout /t 3 /nobreak >nul
docker info >nul 2>nul
if not errorlevel 1 goto docker_ready
set /a tries+=1
if %tries% lss 60 goto wait_docker
echo [x] Docker did not start. Open Docker Desktop manually, wait until it says "running", then run this again.
pause
exit /b 1
:docker_ready
echo [ok] Docker is running

if not exist "backend\.env" (call node backend\scripts\setup-env.js || goto failed)

if not exist "node_modules" (call npm install || goto failed)
if not exist "backend\node_modules" (call npm install --prefix backend || goto failed)
if not exist "frontend\node_modules" (call npm install --prefix frontend || goto failed)
echo [ok] Dependencies installed

echo [..] Starting PostgreSQL + pgvector...
docker compose up -d || goto failed
set /a tries=0
:wait_db
docker compose exec -T db pg_isready -U secondbrain -d second_brain >nul 2>nul
if not errorlevel 1 goto db_ready
set /a tries+=1
if %tries% gtr 40 goto failed
timeout /t 2 /nobreak >nul
goto wait_db
:db_ready
echo [ok] Database is ready on port 5433

echo.
echo  Opening http://localhost:5173 in a few seconds...
echo  Keep this window open while you use the app. Press Ctrl+C to stop.
echo.
start "" /min cmd /c "timeout /t 10 /nobreak >nul && start http://localhost:5173"
call npm run dev
goto end

:failed
echo.
echo [x] Something went wrong - see the messages above.
pause
exit /b 1
:end
endlocal

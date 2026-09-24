@echo off
title Golden Tournament - Local Proxy Server
cls
echo ========================================================
echo  [Golden Tournament] Chzzk Proxy Server (Port 8000)
echo  http://localhost:8000/
echo  Keep this window open while using Chzzk integration.
echo ========================================================
echo.

rem 브라우저 자동 실행 (로컬 프록시 서버 주소로 직접 접속하여 CORS 및 Mixed Content 완전 차단)
start http://localhost:8000/

rem Python 실행 환경 사전 점검
python --version >nul 2>&1
if errorlevel 1 (
  echo [Notice] Python is required to run the local proxy server.
  echo If Python is not installed, please install Python from https://www.python.org/
  echo (Make sure to check "Add Python to PATH" during installation)
  echo.
)

if exist server.py goto run_server

echo [Info] server.py not found. Downloading proxy script...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/njs1541/GOLDEN-TOURNAMENT/main/server.py', 'server.py')" 2>nul

if exist server.py goto run_server

echo [Warning] Using fallback HTTP server...
python -m http.server 8000
goto end

:run_server
python server.py
goto end

:end
pause

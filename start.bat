@echo off
title Golden Tournament - Local Proxy Server
cls
echo ========================================================
echo  [Golden Tournament] Chzzk Proxy Server (Port 8000)
echo  https://njs1541.github.io/GOLDEN-TOURNAMENT/
echo  Keep this window open while using Chzzk integration.
echo ========================================================
echo.

rem 브라우저 자동 실행 (창이 뜨는 것을 원치 않으시면 아래 줄 맨 앞에 rem을 입력하세요)
start https://njs1541.github.io/GOLDEN-TOURNAMENT/

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

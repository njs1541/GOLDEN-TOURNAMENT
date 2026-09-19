@echo off
title Golden Tournament - Local Proxy Server
cls
echo ========================================================
echo  [Golden Tournament] Local Proxy Server (Port 8000)
echo  http://localhost:8000
echo ========================================================
echo.

if exist server.py goto run_server

echo [Info] server.py not found. Downloading proxy script...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/njs1541/GOLDEN-TOURNAMENT/main/server.py', 'server.py')" 2>nul

if exist server.py goto run_server

echo [Warning] Using fallback HTTP server...
start http://localhost:8000
python -m http.server 8000
goto end

:run_server
start http://localhost:8000
python server.py
goto end

:end
pause

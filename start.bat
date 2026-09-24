@chcp 65001 >nul
@echo off
title PICK LEAGUE - Local Proxy Server
cls

echo ========================================================
echo  [PICK LEAGUE] Chzzk Proxy Server (Port 8000)
echo  Keep this window open while using Chzzk integration.
echo ========================================================
echo.

:: Check if Python is available
python -c "import sys; sys.exit(0)" >nul 2>&1
if not errorlevel 1 goto run_python

:: Python not found: Check and download server.ps1 if needed
if not exist "%~dp0server.ps1" (
    echo [Info] Downloading proxy script server.ps1...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/njs1541/GOLDEN-TOURNAMENT/main/server.ps1', '%~dp0server.ps1')" 2>nul
)

if exist "%~dp0server.ps1" goto run_powershell

:: If neither is available
echo [Notice] Python is required if server.ps1 is missing.
echo Please install Python from https://www.python.org/
echo Check Add Python to PATH during installation.
echo.
pause
exit /b

:run_python
if not exist "%~dp0server.py" (
    if not exist "%~dp0server.ps1" (
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/njs1541/GOLDEN-TOURNAMENT/main/server.py', '%~dp0server.py')" 2>nul
    )
)
if exist "%~dp0server.py" (
    echo [OK] Python detected. Starting python server.py...
    python "%~dp0server.py"
    pause
    exit /b
)
goto run_powershell

:run_powershell
echo [OK] Launching built-in Windows PowerShell Server (Zero install)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
exit /b

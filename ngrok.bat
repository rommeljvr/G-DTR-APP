@echo off
echo ========================================
echo Ngrok Tunnel Setup
echo ========================================
echo.
echo This script will start ngrok to expose
echo your local app to the internet for testing.
echo.

REM Check if ngrok is installed
where ngrok >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: ngrok is not installed or not in PATH
    echo.
    echo To install ngrok:
    echo 1. Download from: https://ngrok.com/download
    echo 2. Extract the zip file
    echo 3. Move ngrok.exe to a folder in your PATH (e.g., C:\Windows)
    echo    OR add the folder to your PATH environment variable
    echo.
    pause
    exit /b 1
)

echo Starting ngrok tunnel on port 3000...
echo.
echo Your app will be accessible at the HTTPS URL shown below.
echo Use this URL to test the app with Google Apps Script.
echo.
echo Press Ctrl+C to stop ngrok
echo.

ngrok http 3000

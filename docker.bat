@echo off
echo ========================================
echo Docker Build and Run Script
echo ========================================
echo.
echo NOTE: GPS requires HTTPS on mobile devices.
echo Access at https://YOUR_IP:3443 after installing SSL certificate.
echo.

:menu
echo Choose an option:
echo 1. Build and run Docker container
echo 2. Rebuild and run Docker container (force rebuild)
echo 3. Stop Docker container
echo 4. Remove Docker container
echo 5. View container logs
echo 6. Start ngrok tunnel (for CORS testing)
echo 7. Exit
echo.
set /p choice=Enter your choice (1-7): 

if "%choice%"=="1" goto build_run
if "%choice%"=="2" goto rebuild
if "%choice%"=="3" goto stop
if "%choice%"=="4" goto remove
if "%choice%"=="5" goto logs
if "%choice%"=="6" goto ngrok
if "%choice%"=="7" goto end
echo Invalid choice. Please try again.
goto menu

:build_run
echo.
echo Building and running Docker container...
docker-compose up -d --build
if %errorlevel% neq 0 (
    echo Error: Failed to build/run container
    goto menu
)
echo.
echo Container is running at http://localhost:3000
goto menu

:rebuild
echo.
echo Stopping and removing existing container...
docker-compose down
echo.
echo Rebuilding and running Docker container (no cache)...
docker-compose build --no-cache
docker-compose up -d
if %errorlevel% neq 0 (
    echo Error: Failed to rebuild/run container
    goto menu
)
echo.
echo Container is running at http://localhost:3000
goto menu

:stop
echo.
echo Stopping Docker container...
docker-compose stop
if %errorlevel% neq 0 (
    echo Error: Failed to stop container
    goto menu
)
echo Container stopped.
goto menu

:remove
echo.
echo Stopping and removing Docker container...
docker-compose down
if %errorlevel% neq 0 (
    echo Error: Failed to remove container
    goto menu
)
echo Container removed.
goto menu

:logs
echo.
echo Showing container logs (press Ctrl+C to exit)...
docker-compose logs -f
goto menu

:ngrok
echo.
echo Starting ngrok tunnel...
echo.
ngrok version >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: ngrok is not installed or not in PATH
    echo.
    echo To install ngrok:
    echo 1. Download from: https://ngrok.com/download
    echo 2. Extract the zip file
    echo 3. Move ngrok.exe to a folder in your PATH (e.g., C:\Windows)
    echo    OR add the folder to your PATH environment variable
    echo.
    pause
    goto menu
)
echo.
echo Your app will be accessible at the HTTPS URL shown below.
echo Use this URL to test the app with Google Apps Script.
echo.
echo Press Ctrl+C to stop ngrok
echo.
ngrok http 3000
goto menu

:end
echo.
echo Goodbye!

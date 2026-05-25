@echo off
echo ========================================
echo SSL Certificate Setup
echo ========================================
echo.
echo This will generate self-signed SSL certificates
echo and configure Docker to use HTTPS.
echo.
pause

echo.
echo Running PowerShell script...
powershell -ExecutionPolicy Bypass -File generate-ssl.ps1

if %errorlevel% neq 0 (
    echo.
    echo SSL generation failed. Please check the errors above.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Next Steps:
echo ========================================
echo.
echo 1. Install the SSL certificate on your mobile device
echo    (See instructions above)
echo.
echo 2. Update Docker configuration to use SSL:
echo    - Edit Dockerfile to copy SSL certificates
echo    - Edit nginx.conf to enable HTTPS
echo    - Edit docker-compose.yml to expose port 3443
echo.
echo 3. Rebuild the Docker container
echo.
pause

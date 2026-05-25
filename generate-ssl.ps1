Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "Generate Self-Signed SSL Certificates" -ForegroundColor Cyan
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "ssl")) {
    New-Item -ItemType Directory -Path "ssl" | Out-Null
}

Write-Host "Checking for OpenSSL..." -ForegroundColor Yellow

# Check common OpenSSL installation paths
$opensslPaths = @(
    "openssl",
    "C:\Program Files\OpenSSL-Win64\bin\openssl.exe",
    "C:\Program Files\OpenSSL-Win32\bin\openssl.exe",
    "C:\Program Files (x86)\OpenSSL-Win64\bin\openssl.exe",
    "C:\Program Files (x86)\OpenSSL-Win32\bin\openssl.exe",
    "C:\Program Files\OpenSSL\bin\openssl.exe",
    "C:\Program Files (x86)\OpenSSL\bin\openssl.exe"
)

$opensslPath = $null
foreach ($path in $opensslPaths) {
    try {
        $result = & $path version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $opensslPath = $path
            Write-Host "OpenSSL found: $result" -ForegroundColor Green
            break
        }
    } catch {
        continue
    }
}

if (-not $opensslPath) {
    Write-Host "OpenSSL not found in PATH or common installation locations." -ForegroundColor Red
    Write-Host ""
    Write-Host "Please add OpenSSL to your system PATH or use the 'Win64 OpenSSL Command Prompt'." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To add to PATH:" -ForegroundColor Yellow
    Write-Host "1. Search for 'Environment Variables' in Windows" -ForegroundColor White
    Write-Host "2. Click 'Edit the system environment variables'" -ForegroundColor White
    Write-Host "3. Click 'Environment Variables'" -ForegroundColor White
    Write-Host "4. Add OpenSSL bin directory to PATH" -ForegroundColor White
    Write-Host "   (e.g., C:\Program Files\OpenSSL-Win64\bin)" -ForegroundColor White
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Generating self-signed SSL certificate..." -ForegroundColor Yellow
$result = & $opensslPath req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Error: Failed to generate SSL certificates." -ForegroundColor Red
    Write-Host $result -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "========================================"  -ForegroundColor Green
Write-Host "SSL certificates generated successfully!" -ForegroundColor Green
Write-Host "========================================"  -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: You MUST trust this certificate on your mobile device:" -ForegroundColor Yellow
Write-Host ""
Write-Host "For Android:" -ForegroundColor Cyan
Write-Host "1. Copy ssl/cert.pem to your phone (via USB, email, or cloud)" -ForegroundColor White
Write-Host "2. Open Settings - Security - Encryption and credentials - Install a certificate" -ForegroundColor White
Write-Host "3. Select CA certificate and choose the cert.pem file" -ForegroundColor White
Write-Host "4. Name it (e.g., DTR App) and install" -ForegroundColor White
Write-Host "5. Access app at https://YOUR_IP:3443" -ForegroundColor White
Write-Host ""
Write-Host "For iOS:" -ForegroundColor Cyan
Write-Host "1. Copy ssl/cert.pem to your phone (AirDrop, email, or cloud)" -ForegroundColor White
Write-Host "2. Open the certificate file" -ForegroundColor White
Write-Host "3. Tap Install and enter your device passcode" -ForegroundColor White
Write-Host "4. Go to Settings - General - About - Certificate Trust Settings" -ForegroundColor White
Write-Host "5. Enable Full Trust for the certificate" -ForegroundColor White
Write-Host "6. Access app at https://YOUR_IP:3443" -ForegroundColor White
Write-Host ""
Write-Host "After installing the certificate, rebuild the Docker container:" -ForegroundColor Yellow
Write-Host "Run docker.bat and choose option 2 (Rebuild)" -ForegroundColor Yellow
Write-Host ""
Read-Host "Press Enter to exit"

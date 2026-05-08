#Requires -Version 5.1
<#
.SYNOPSIS
    MedInventory Windows Installer
.DESCRIPTION
    Installs Docker Desktop (if needed) and sets up MedInventory for a Windows clinic.
    Must be run as Administrator.
.NOTES
    Run with:  powershell -ExecutionPolicy Bypass -File install.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─── Colours ────────────────────────────────────────────────────────────────
function Write-Step   { Write-Host "  ► $args" -ForegroundColor Cyan }
function Write-Ok     { Write-Host "  ✓ $args" -ForegroundColor Green }
function Write-Warn   { Write-Host "  ⚠ $args" -ForegroundColor Yellow }
function Write-Err    { Write-Host "  ✗ $args" -ForegroundColor Red }
function Write-Banner { Write-Host "`n$args`n" -ForegroundColor White }

Write-Banner @"
╔══════════════════════════════════════════════════════╗
║          MedInventory — Windows Installer            ║
║          Clinic Inventory Management System          ║
╚══════════════════════════════════════════════════════╝
"@

# ─── 1. Admin check ──────────────────────────────────────────────────────────
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Err "This installer must be run as Administrator."
    Write-Host "  Right-click install.ps1 → 'Run with PowerShell as Administrator'" -ForegroundColor Yellow
    Read-Host "`nPress Enter to exit"
    exit 1
}
Write-Ok "Running as Administrator"

# ─── 2. Choose install directory ─────────────────────────────────────────────
$defaultDir = "C:\MedInventory"
Write-Host ""
Write-Host "  Installation directory (press Enter for default: $defaultDir):" -ForegroundColor Cyan
$installDir = Read-Host "  >"
if ([string]::IsNullOrWhiteSpace($installDir)) { $installDir = $defaultDir }

if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    Write-Ok "Created $installDir"
} else {
    Write-Ok "Using existing directory $installDir"
}

# ─── 3. Check Docker Desktop ─────────────────────────────────────────────────
Write-Step "Checking for Docker Desktop..."

$dockerExe = @(
    "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "$Env:LocalAppData\Docker Desktop Installer\Docker Desktop Installer.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$dockerCli = Get-Command docker -ErrorAction SilentlyContinue

if ($dockerCli) {
    Write-Ok "Docker is already installed: $(docker --version 2>&1)"
} else {
    Write-Warn "Docker Desktop not found. Downloading installer..."
    Write-Host "  (This is a ~550MB download — please wait)" -ForegroundColor Gray

    $dockerInstaller = "$Env:TEMP\DockerDesktopInstaller.exe"
    $dockerUrl = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"

    try {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri $dockerUrl -OutFile $dockerInstaller -UseBasicParsing
        Write-Ok "Downloaded Docker Desktop installer"
    } catch {
        Write-Err "Failed to download Docker Desktop: $_"
        Write-Host ""
        Write-Host "  Please download and install Docker Desktop manually from:" -ForegroundColor Yellow
        Write-Host "  https://www.docker.com/products/docker-desktop/" -ForegroundColor Cyan
        Write-Host "  Then re-run this installer." -ForegroundColor Yellow
        Read-Host "`nPress Enter to exit"
        exit 1
    }

    Write-Step "Installing Docker Desktop (this may take several minutes)..."
    $proc = Start-Process $dockerInstaller -ArgumentList "install --quiet --accept-license" -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Err "Docker Desktop installation failed (exit code $($proc.ExitCode))."
        Read-Host "`nPress Enter to exit"
        exit 1
    }
    Write-Ok "Docker Desktop installed"

    Write-Warn "Docker Desktop needs to start before we can continue."
    Write-Step "Starting Docker Desktop..."
    Start-Process "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"

    Write-Host "  Waiting for Docker to be ready (up to 2 minutes)..." -ForegroundColor Gray
    $timeout = 120
    $elapsed = 0
    $ready = $false
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds 5
        $elapsed += 5
        try {
            $null = docker info 2>&1
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        } catch {}
        Write-Host "  Still waiting... ($elapsed/$timeout s)" -ForegroundColor DarkGray
    }

    if (-not $ready) {
        Write-Warn "Docker did not start within 2 minutes."
        Write-Host ""
        Write-Host "  Please start Docker Desktop manually, then run this installer again." -ForegroundColor Yellow
        Read-Host "`nPress Enter to exit"
        exit 1
    }
    Write-Ok "Docker is running"
}

# ─── 4. Wait for Docker daemon if installed but not running ──────────────────
$dockerRunning = $false
try {
    $null = docker info 2>&1
    $dockerRunning = ($LASTEXITCODE -eq 0)
} catch {}

if (-not $dockerRunning) {
    Write-Step "Docker is installed but not running. Starting Docker Desktop..."
    $dde = @(
        "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "$Env:LocalAppData\Programs\Docker\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($dde) { Start-Process $dde }

    $timeout = 120; $elapsed = 0
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds 5; $elapsed += 5
        try {
            $null = docker info 2>&1
            if ($LASTEXITCODE -eq 0) { $dockerRunning = $true; break }
        } catch {}
        Write-Host "  Waiting for Docker... ($elapsed/$timeout s)" -ForegroundColor DarkGray
    }

    if (-not $dockerRunning) {
        Write-Err "Docker did not start. Please start Docker Desktop manually and re-run."
        Read-Host "`nPress Enter to exit"
        exit 1
    }
}
Write-Ok "Docker daemon is running"

# ─── 5. Copy application files ───────────────────────────────────────────────
Write-Step "Copying application files to $installDir..."

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceDir  = Split-Path -Parent $scriptDir   # one level up from installer/

# Copy everything except node_modules and dist
$excludeDirs = @('node_modules', 'dist', '.git', 'coverage', '__pycache__')

Get-ChildItem -Path $sourceDir | Where-Object {
    $_.Name -notin $excludeDirs -and $_.Name -ne 'installer'
} | ForEach-Object {
    $dest = Join-Path $installDir $_.Name
    if ($_.PSIsContainer) {
        # Robocopy for directories — excludes node_modules inside them too
        $null = robocopy $_.FullName $dest /E /XD node_modules dist .git coverage /NFL /NDL /NJH /NJS
    } else {
        Copy-Item $_.FullName $dest -Force
    }
}
Write-Ok "Application files copied"

# ─── 6. Generate .env with strong random secrets ─────────────────────────────
$envFile = Join-Path $installDir ".env"

if (Test-Path $envFile) {
    Write-Warn ".env already exists — skipping secret generation (keeping existing config)"
} else {
    Write-Step "Generating secure secrets..."

    function New-RandomHex64 {
        $bytes = New-Object byte[] 64
        [Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($bytes)
        return [BitConverter]::ToString($bytes) -replace '-',''
    }

    function New-RandomPassword {
        $chars  = 'abcdefghijklmnopqrstuvwxyz'
        $upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        $digits = '0123456789'
        $all    = $chars + $upper + $digits + '!@#$%^'
        $rng    = [Security.Cryptography.RNGCryptoServiceProvider]::Create()
        $bytes  = New-Object byte[] 32
        $rng.GetBytes($bytes)
        $pwd = ($bytes | ForEach-Object { $all[$_ % $all.Length] }) -join ''
        # Ensure complexity
        return ($chars[0] + $upper[0] + $digits[0] + '!' + $pwd.Substring(4))
    }

    $dbPass       = New-RandomPassword
    $jwtSecret    = New-RandomHex64
    $jwtRefresh   = New-RandomHex64

    $envContent = @"
# MedInventory — Generated by installer on $(Get-Date -Format 'yyyy-MM-dd HH:mm')
# DO NOT share this file — it contains sensitive secrets

DB_NAME=medical_inventory
DB_USER=medinv
DB_PASSWORD=$dbPass

JWT_SECRET=$jwtSecret
JWT_REFRESH_SECRET=$jwtRefresh
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

NODE_ENV=production
CORS_ORIGIN=*
SESSION_TIMEOUT_MINUTES=30
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_MINUTES=15
"@
    Set-Content -Path $envFile -Value $envContent -Encoding UTF8
    Write-Ok ".env created with strong random secrets"
}

# ─── 7. Allow port 3000 through Windows Firewall ─────────────────────────────
Write-Step "Configuring Windows Firewall for port 3000..."
$rule = Get-NetFirewallRule -DisplayName "MedInventory" -ErrorAction SilentlyContinue
if (-not $rule) {
    New-NetFirewallRule -DisplayName "MedInventory" -Direction Inbound -Protocol TCP `
        -LocalPort 3000 -Action Allow -Profile Domain,Private | Out-Null
    Write-Ok "Firewall rule created (port 3000 open on LAN)"
} else {
    Write-Ok "Firewall rule already exists"
}

# ─── 8. Build and start containers ───────────────────────────────────────────
Write-Step "Building and starting MedInventory (first run takes 3-5 minutes)..."
Set-Location $installDir

$composeArgs = "compose up --build -d"
$proc = Start-Process "docker" -ArgumentList $composeArgs -Wait -PassThru -WorkingDirectory $installDir
if ($proc.ExitCode -ne 0) {
    Write-Err "docker compose failed. Check Docker Desktop is running and try again."
    Read-Host "`nPress Enter to exit"
    exit 1
}
Write-Ok "Containers started"

# ─── 9. Wait for health check ────────────────────────────────────────────────
Write-Step "Waiting for application to be ready..."
$timeout = 60; $elapsed = 0; $ready = $false
while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds 3; $elapsed += 3
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}

# ─── 10. Create desktop shortcut ─────────────────────────────────────────────
Write-Step "Creating desktop shortcut..."
$wsh      = New-Object -ComObject WScript.Shell
$desktop  = [Environment]::GetFolderPath('CommonDesktopDirectory')
$lnk      = $wsh.CreateShortcut("$desktop\MedInventory.lnk")
$lnk.TargetPath       = "http://localhost:3000"
$lnk.Description      = "MedInventory — Clinic Inventory Management"
$lnk.WorkingDirectory = $installDir
$lnk.Save()
Write-Ok "Desktop shortcut created"

# ─── 11. Create Start-on-boot Task Scheduler task ────────────────────────────
Write-Step "Configuring auto-start on Windows boot..."
$taskName   = "MedInventory-Start"
$taskExists = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if (-not $taskExists) {
    $action  = New-ScheduledTaskAction -Execute "docker" -Argument "compose up -d" -WorkingDirectory $installDir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal -Description "Starts MedInventory on boot" | Out-Null
    Write-Ok "Auto-start task registered (runs as SYSTEM on boot)"
} else {
    Write-Ok "Auto-start task already exists"
}

# ─── 12. Create uninstaller shortcut ─────────────────────────────────────────
$uninstallSrc = Join-Path $scriptDir "uninstall.ps1"
$uninstallDst = Join-Path $installDir "uninstall.ps1"
if (Test-Path $uninstallSrc) {
    Copy-Item $uninstallSrc $uninstallDst -Force
}

# ─── Done ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  MedInventory installed successfully!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""

# Get LAN IP
$lanIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notmatch '^(127|169|172\.(1[6-9]|2[0-9]|3[01]))' -and
    $_.PrefixOrigin -ne 'WellKnown'
} | Select-Object -First 1).IPAddress

if ($ready) {
    Write-Host "  This PC:        " -NoNewline; Write-Host "http://localhost:3000" -ForegroundColor Cyan
    if ($lanIP) {
        Write-Host "  Other devices:  " -NoNewline; Write-Host "http://$lanIP`:3000" -ForegroundColor Cyan
    }
} else {
    Write-Host "  The app is still starting. Try in a minute:" -ForegroundColor Yellow
    Write-Host "  http://localhost:3000" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "  Default login (change immediately):" -ForegroundColor Gray
Write-Host "    Admin:  admin@clinic.local / Admin123!" -ForegroundColor Gray
Write-Host "    Doctor: doctor@clinic.local / Doctor123!" -ForegroundColor Gray
Write-Host "    Nurse:  nurse@clinic.local / Nurse123!" -ForegroundColor Gray
Write-Host ""
Write-Host "  Installed to: $installDir" -ForegroundColor Gray
Write-Host "  To update:    run update.ps1 in $installDir" -ForegroundColor Gray
Write-Host ""

# Open browser
try { Start-Process "http://localhost:3000" } catch {}

Read-Host "Press Enter to close this window"

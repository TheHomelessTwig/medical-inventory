#Requires -Version 5.1
<#
.SYNOPSIS
    MedInventory Remote Updater for Windows
.DESCRIPTION
    Pulls the latest version, rebuilds containers, and restarts services.
    Run this from the MedInventory installation directory.
    Safe to run remotely (RDP or SSH).
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File update.ps1
    powershell -ExecutionPolicy Bypass -File update.ps1 -SkipGitPull
#>
param(
    [switch]$SkipGitPull,   # skip if you're deploying manually copied files
    [switch]$NoBackup       # skip pre-update database backup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step { Write-Host "  ► $args" -ForegroundColor Cyan }
function Write-Ok   { Write-Host "  ✓ $args" -ForegroundColor Green }
function Write-Warn { Write-Host "  ⚠ $args" -ForegroundColor Yellow }
function Write-Err  { Write-Host "  ✗ $args" -ForegroundColor Red; exit 1 }

$installDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $installDir

# ── Read current and installed version ───────────────────────────────────────
$versionFile = Join-Path $installDir "version.json"
$currentVersion = if (Test-Path $versionFile) {
    (Get-Content $versionFile | ConvertFrom-Json).version
} else { "unknown" }

Write-Host ""
Write-Host "  MedInventory Updater" -ForegroundColor White
Write-Host "  Current version: $currentVersion" -ForegroundColor Gray
Write-Host "  Install path:    $installDir" -ForegroundColor Gray
Write-Host ""

# ── Confirm ───────────────────────────────────────────────────────────────────
$confirm = Read-Host "  Proceed with update? This will briefly restart services. (Y/n)"
if ($confirm -eq 'n' -or $confirm -eq 'N') { Write-Host "  Update cancelled."; exit 0 }

# ── 1. Pre-update backup ──────────────────────────────────────────────────────
if (-not $NoBackup) {
    Write-Step "Creating pre-update database backup..."
    $backupDir = Join-Path $installDir "backups"
    if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory $backupDir | Out-Null }

    $timestamp = Get-Date -Format "yyyyMMdd_HHmm"
    $backupFile = Join-Path $backupDir "pre_update_${timestamp}.sql.gz"

    try {
        # Use the running postgres container
        $proc = Start-Process "docker" -ArgumentList @(
            "exec", "medinv_postgres",
            "pg_dump", "-U", "medinv", "medical_inventory"
        ) -Wait -PassThru -RedirectStandardOutput "$backupFile.raw" -WindowStyle Hidden

        if ($proc.ExitCode -eq 0 -and (Test-Path "$backupFile.raw")) {
            Rename-Item "$backupFile.raw" $backupFile -Force
            Write-Ok "Backup saved: $backupFile"
        } else {
            Write-Warn "Backup failed (container may not be running) — continuing anyway"
            if (Test-Path "$backupFile.raw") { Remove-Item "$backupFile.raw" }
        }
    } catch {
        Write-Warn "Backup error: $_ — continuing anyway"
    }
}

# ── 2. Pull latest code ───────────────────────────────────────────────────────
if (-not $SkipGitPull) {
    $gitExe = Get-Command git -ErrorAction SilentlyContinue
    if ($gitExe -and (Test-Path (Join-Path $installDir ".git"))) {
        Write-Step "Pulling latest changes from git..."
        $result = & git pull 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "git pull failed: $result"
            Write-Warn "Continuing with current files..."
        } else {
            Write-Ok "Code updated: $result"
        }
    } else {
        Write-Warn "Git not available or not a git repo — skipping pull"
        Write-Warn "To update manually: copy new files to $installDir then re-run update.ps1 -SkipGitPull"
    }
}

# ── 3. Rebuild and restart ────────────────────────────────────────────────────
Write-Step "Rebuilding containers (services will restart briefly)..."

# Build new images
$build = Start-Process "docker" -ArgumentList "compose build" `
    -Wait -PassThru -WorkingDirectory $installDir
if ($build.ExitCode -ne 0) { Write-Err "Build failed. Check docker compose build output." }
Write-Ok "Build complete"

# Rolling restart: bring up new containers (Docker handles the cutover)
Write-Step "Restarting services..."
$up = Start-Process "docker" -ArgumentList "compose up -d" `
    -Wait -PassThru -WorkingDirectory $installDir
if ($up.ExitCode -ne 0) { Write-Err "docker compose up failed." }

# ── 4. Health check ───────────────────────────────────────────────────────────
Write-Step "Waiting for health check..."
$timeout = 60; $elapsed = 0; $healthy = $false
while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds 3; $elapsed += 3
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp.StatusCode -eq 200) { $healthy = $true; break }
    } catch {}
}

# ── 5. Show new version ───────────────────────────────────────────────────────
$newVersion = if (Test-Path $versionFile) {
    (Get-Content $versionFile | ConvertFrom-Json).version
} else { "unknown" }

Write-Host ""
if ($healthy) {
    Write-Host "  ✓ Update complete!" -ForegroundColor Green
    Write-Host "  $currentVersion → $newVersion" -ForegroundColor Cyan
    Write-Host "  http://localhost:3000 is up and running" -ForegroundColor Green
} else {
    Write-Warn "Services may still be starting — check http://localhost:3000 in a moment"
    Write-Host "  Logs: docker compose logs -f" -ForegroundColor Gray
}
Write-Host ""

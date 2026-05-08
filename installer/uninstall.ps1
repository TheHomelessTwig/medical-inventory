#Requires -Version 5.1
<#
.SYNOPSIS
    MedInventory Uninstaller
.DESCRIPTION
    Stops and removes MedInventory containers. Optionally deletes all data.
    Must be run as Administrator.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Run as Administrator." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "MedInventory Uninstaller" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""

$installDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $installDir "docker-compose.yml"))) {
    $installDir = "C:\MedInventory"
}

Write-Host "This will stop all MedInventory services." -ForegroundColor Yellow
$keepData = Read-Host "Keep your database/data? (Y/n)"
$deleteFiles = Read-Host "Delete application files from $installDir? (y/N)"

Set-Location $installDir

# Stop containers
Write-Host "Stopping containers..." -ForegroundColor Cyan
if ($keepData -eq 'n' -or $keepData -eq 'N') {
    docker compose down -v 2>&1 | Out-Null
    Write-Host "  Containers stopped and data volumes removed." -ForegroundColor Green
} else {
    docker compose down 2>&1 | Out-Null
    Write-Host "  Containers stopped. Data preserved." -ForegroundColor Green
}

# Remove scheduled task
$task = Get-ScheduledTask -TaskName "MedInventory-Start" -ErrorAction SilentlyContinue
if ($task) {
    Unregister-ScheduledTask -TaskName "MedInventory-Start" -Confirm:$false
    Write-Host "  Auto-start task removed." -ForegroundColor Green
}

# Remove firewall rule
$rule = Get-NetFirewallRule -DisplayName "MedInventory" -ErrorAction SilentlyContinue
if ($rule) {
    Remove-NetFirewallRule -DisplayName "MedInventory"
    Write-Host "  Firewall rule removed." -ForegroundColor Green
}

# Remove desktop shortcut
$shortcut = "$([Environment]::GetFolderPath('CommonDesktopDirectory'))\MedInventory.lnk"
if (Test-Path $shortcut) { Remove-Item $shortcut -Force; Write-Host "  Desktop shortcut removed." -ForegroundColor Green }

# Delete files
if ($deleteFiles -eq 'y' -or $deleteFiles -eq 'Y') {
    Set-Location $Env:USERPROFILE
    Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Application files deleted." -ForegroundColor Green
}

Write-Host ""
Write-Host "MedInventory has been uninstalled." -ForegroundColor Green
Write-Host "(Docker Desktop itself was not removed.)" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to close"

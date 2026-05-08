# S.H.I.T. — Windows Backup Script
# Run manually or schedule with Task Scheduler (see DEPLOYMENT.md).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File backup.ps1
#   powershell -ExecutionPolicy Bypass -File backup.ps1 -BackupDir "D:\Backups\MedInventory" -RetainDays 30

param(
  [string]$BackupDir  = "C:\MedInventory\backups",
  [int]   $RetainDays = 30,
  [string]$DbUser     = "medinv",
  [string]$DbName     = "medical_inventory"
)

$ErrorActionPreference = "Stop"

# Create backup directory if it doesn't exist
if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$timestamp  = Get-Date -Format "yyyyMMdd_HHmm"
$backupFile = Join-Path $BackupDir "backup_$timestamp.sql.gz"

Write-Host "S.H.I.T. Database Backup" -ForegroundColor Cyan
Write-Host "  Container : medinv_postgres"
Write-Host "  Database  : $DbName"
Write-Host "  Output    : $backupFile"
Write-Host ""

# Check Docker is running
try {
  docker ps --filter "name=medinv_postgres" --format "{{.Names}}" | Out-Null
} catch {
  Write-Host "ERROR: Docker is not running or medinv_postgres container not found." -ForegroundColor Red
  exit 1
}

# Run pg_dump inside the container and compress with gzip
Write-Host "Running pg_dump..." -ForegroundColor Yellow
docker exec medinv_postgres pg_dump -U $DbUser $DbName | gzip | Set-Content -Path $backupFile -Encoding Byte

if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: Backup failed (exit code $LASTEXITCODE)." -ForegroundColor Red
  exit 1
}

$sizeMb = [Math]::Round((Get-Item $backupFile).Length / 1MB, 2)
Write-Host "✓ Backup created: $backupFile ($sizeMb MB)" -ForegroundColor Green

# Prune old backups
$cutoff = (Get-Date).AddDays(-$RetainDays)
$pruned = Get-ChildItem -Path $BackupDir -Filter "backup_*.sql.gz" |
            Where-Object { $_.LastWriteTime -lt $cutoff }

if ($pruned.Count -gt 0) {
  $pruned | Remove-Item -Force
  Write-Host "  Pruned $($pruned.Count) backup(s) older than $RetainDays days." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Backup complete." -ForegroundColor Green

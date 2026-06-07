#requires -Version 5.1
<#
.SYNOPSIS
    Creates a timestamped PostgreSQL backup using pg_dump.

.DESCRIPTION
    This script runs pg_dump against a PostgreSQL database and stores the
    resulting SQL file in the specified output directory with a timestamped
    filename. It also rotates old backups, keeping only the most recent 30.

.PARAMETER DatabaseName
    The name of the PostgreSQL database to back up.
    Example: coder_survival_production

.PARAMETER User
    The PostgreSQL user to connect as.
    Example: postgres

.PARAMETER Host
    The hostname or IP address of the PostgreSQL server.
    Example: localhost or your-cloud-vm-ip

.PARAMETER OutputDir
    The local directory where backup files will be saved.
    Defaults to .\backups

.PARAMETER Port
    The PostgreSQL port. Defaults to 5432.

.PARAMETER ViaSsh
    If specified, the script will run pg_dump over SSH on a remote host
    and then copy the file down via SCP. Set $env:PROD_USER and $env:PROD_HOST
    when using this switch.

.EXAMPLE
    .\backup-db.ps1 -DatabaseName coder_survival_test -User postgres -Host localhost

.EXAMPLE
    .\backup-db.ps1 -DatabaseName coder_survival_production -User postgres -Host api.your-domain.com -OutputDir C:\Backups

.NOTES
    Requires pg_dump in PATH (install via choco install postgresql15 or winget).
    When using -ViaSsh, ensure SSH keys are configured and PROD_USER/PROD_HOST
    environment variables are set.
#>

param(
    [Parameter(Mandatory = $true, HelpMessage = "Database name to back up")]
    [string]$DatabaseName,

    [Parameter(Mandatory = $true, HelpMessage = "PostgreSQL user")]
    [string]$User,

    [Parameter(Mandatory = $true, HelpMessage = "PostgreSQL host")]
    [string]$Host,

    [Parameter(Mandatory = $false, HelpMessage = "Local output directory")]
    [string]$OutputDir = ".\backups",

    [Parameter(Mandatory = $false, HelpMessage = "PostgreSQL port")]
    [int]$Port = 5432,

    [Parameter(Mandatory = $false, HelpMessage = "Run pg_dump via SSH on remote host")]
    [switch]$ViaSsh
)

$ErrorActionPreference = "Stop"

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
    Write-Host "Created output directory: $OutputDir" -ForegroundColor Yellow
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "backup_${DatabaseName}_${timestamp}.sql"

if ($ViaSsh) {
    # Remote backup via SSH + SCP
    $prodUser = $env:PROD_USER
    $prodHost = $env:PROD_HOST

    if (-not $prodUser -or -not $prodHost) {
        Write-Error "Environment variables PROD_USER and PROD_HOST must be set when using -ViaSsh."
        exit 1
    }

    Write-Host "Running remote pg_dump on ${prodHost}..." -ForegroundColor Cyan
    ssh "${prodUser}@${prodHost}" "pg_dump -U ${User} -d ${DatabaseName} > /tmp/${backupFile}"

    Write-Host "Downloading backup via SCP..." -ForegroundColor Cyan
    scp "${prodUser}@${prodHost}:/tmp/${backupFile}" "${OutputDir}\${backupFile}"

    Write-Host "Cleaning up remote temp file..." -ForegroundColor Gray
    ssh "${prodUser}@${prodHost}" "rm -f /tmp/${backupFile}"
} else {
    # Local or direct pg_dump
    $outputPath = Join-Path $OutputDir $backupFile
    Write-Host "Running pg_dump for database '${DatabaseName}' to ${outputPath} ..." -ForegroundColor Cyan
    pg_dump -h $Host -p $Port -U $User -d $DatabaseName -f $outputPath
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "Backup created successfully: ${backupFile}" -ForegroundColor Green
} else {
    Write-Error "pg_dump failed with exit code ${LASTEXITCODE}."
}

# Rotate old backups — keep only the most recent 30 files
$backupFiles = Get-ChildItem -Path $OutputDir -Filter "backup_*.sql" | Sort-Object LastWriteTime -Descending
$oldBackups = $backupFiles | Select-Object -Skip 30

if ($oldBackups) {
    Write-Host "Rotating old backups (keeping 30 most recent)..." -ForegroundColor Yellow
    $oldBackups | Remove-Item -Force
    Write-Host "Removed $($oldBackups.Count) old backup(s)." -ForegroundColor Gray
}

Write-Host "Done." -ForegroundColor Green

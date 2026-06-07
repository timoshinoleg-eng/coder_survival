#requires -Version 5.1
<#
.SYNOPSIS
    Creates a git worktree for isolated agent development.

.DESCRIPTION
    This script creates a git worktree from the current repository,
    allowing multiple agents to work in parallel on separate feature branches
    without interfering with each other.

.PARAMETER Branch
    The name of the branch to check out in the worktree.
    Example: feat/kimi/FEAT-03-antifraud

.PARAMETER Path
    The directory path where the worktree will be created.
    Example: ..\coder_survival-kimi

.EXAMPLE
    .\create-worktree.ps1 -Branch feat/kimi/FEAT-03-antifraud -Path ..\coder_survival-kimi

.EXAMPLE
    .\create-worktree.ps1 -Branch feat/desktop/FEAT-01-ux-polish -Path ..\coder_survival-desktop

.NOTES
    The branch will be created if it does not already exist.
    Each agent should only touch directories they own (see AGENTS.md).
#>

param(
    [Parameter(Mandatory = $true, HelpMessage = "Feature branch name")]
    [string]$Branch,

    [Parameter(Mandatory = $true, HelpMessage = "Path for the new worktree")]
    [string]$Path
)

$ErrorActionPreference = "Stop"

# Verify we are inside a git repository
$gitDir = git rev-parse --git-dir 2>$null
if (-not $gitDir) {
    Write-Error "Not a git repository. Please run this script from inside the repo root."
    exit 1
}

# Resolve the target path to an absolute path
$resolvedPath = Resolve-Path -Path $Path -ErrorAction SilentlyContinue
if (-not $resolvedPath) {
    $resolvedPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

# Check if the branch already exists; if not, create it
$branchExists = git show-ref --verify --quiet refs/heads/$Branch
if ($LASTEXITCODE -ne 0) {
    Write-Host "Branch '$Branch' does not exist. Creating it..." -ForegroundColor Yellow
    git branch $Branch
} else {
    Write-Host "Branch '$Branch' found." -ForegroundColor Green
}

# Create the worktree
Write-Host "Creating worktree at '$resolvedPath' for branch '$Branch'..." -ForegroundColor Cyan
git worktree add $resolvedPath $Branch

if ($LASTEXITCODE -eq 0) {
    Write-Host "Worktree created successfully." -ForegroundColor Green
    Write-Host "  Location: $resolvedPath" -ForegroundColor Gray
    Write-Host "  Branch:   $Branch" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Reminder: touch only directories you own (see AGENTS.md)." -ForegroundColor Magenta
} else {
    Write-Error "Failed to create worktree. Check that the path is empty and the branch name is valid."
}

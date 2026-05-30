[CmdletBinding()]
param(
  [string]$BackendComposeFile = "docker-compose.backend.yml",
  [switch]$AllowDirty,
  [switch]$SkipBuildCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendPath = Join-Path $repoRoot "frontend"
$botPath = Join-Path $repoRoot "bot"
$backendPath = Join-Path $repoRoot "backend"
$composePath = Join-Path $repoRoot $BackendComposeFile

$failed = 0

function Test-Step {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  Write-Host ""
  Write-Host "==> $Label"
  try {
    & $Action
    Write-Host "OK  $Label" -ForegroundColor Green
  } catch {
    Write-Host "FAIL $Label`: $_" -ForegroundColor Red
    $script:failed++
  }
}

Write-Host "=== Coder Survival Release Preflight ==="
Write-Host "Repo: $repoRoot"

# 1. Git status
Test-Step -Label "Git worktree cleanliness" -Action {
  if (-not $AllowDirty) {
    $gitStatus = @(git -C $repoRoot status --porcelain)
    if ($gitStatus.Count -gt 0) {
      throw "Worktree is dirty ($($gitStatus.Count) files). Use -AllowDirty to bypass."
    }
  }
}

# 2. Forbidden secrets
Test-Step -Label "Forbidden secret file scan" -Action {
  $forbidden = @(".env", "backend/.env", "backend/.env.production", "backend/.env.local")
  $found = @()
  foreach ($f in $forbidden) {
    $p = Join-Path $repoRoot $f
    if (Test-Path $p -PathType Leaf) { $found += $f }
  }
  if ($found.Count -gt 0) {
    throw "Found forbidden files: $($found -join ', ')"
  }
}

# 3. Compose syntax
Test-Step -Label "Docker Compose syntax" -Action {
  docker compose -f $composePath config > $null
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose config failed"
  }
}

# 4. Backend package.json integrity
Test-Step -Label "Backend package-lock aligned" -Action {
  Push-Location $backendPath
  try {
    npm ci --dry-run > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "npm ci --dry-run failed"
    }
  } finally {
    Pop-Location
  }
}

# 5. Bot syntax
Test-Step -Label "Bot entrypoint syntax check" -Action {
  node --check (Join-Path $botPath "index.js")
  if ($LASTEXITCODE -ne 0) {
    throw "node --check failed for bot/index.js"
  }
}

# 6. Frontend build (optional because it can be slow)
if (-not $SkipBuildCheck) {
  Test-Step -Label "Frontend build" -Action {
    Push-Location $frontendPath
    try {
      npm ci > $null 2>&1
      if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
      npm run build > $null 2>&1
      if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
    } finally {
      Pop-Location
    }
  }
}

# 7. Smoke script presence
Test-Step -Label "Smoke scripts present" -Action {
  $smoke = Join-Path $PSScriptRoot "smoke-prod.ps1"
  $offerSmoke = Join-Path $PSScriptRoot "smoke-offers.ps1"
  if (-not (Test-Path $smoke)) { throw "smoke-prod.ps1 missing" }
  if (-not (Test-Path $offerSmoke)) { throw "smoke-offers.ps1 missing" }
}

# 8. Migration sequence continuity
Test-Step -Label "Migration sequence continuity" -Action {
  $migrations = Get-ChildItem -Path (Join-Path $backendPath "migrations") -Filter "*.sql" | Sort-Object Name
  $expected = 1
  foreach ($m in $migrations) {
    $num = [int]($m.BaseName.Split('_')[0])
    if ($num -ne $expected) {
      throw "Migration gap: expected ${expected}xxx but found $($m.Name)"
    }
    $expected = $num + 1
  }
  Write-Host "    Found $($migrations.Count) migration(s): $($migrations.Name -join ', ')"
}

Write-Host ""
if ($failed -gt 0) {
  Write-Host "=== Preflight FAILED ($failed check(s)) ===" -ForegroundColor Red
  exit 1
} else {
  Write-Host "=== Preflight PASSED ===" -ForegroundColor Green
  Write-Host "Ready to run: scripts/release-prod.ps1"
}

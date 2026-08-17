[CmdletBinding()]
param(
  [string]$BackendComposeFile = "docker-compose.backend.yml",
  [string]$BackendImageTag = $env:BACKEND_IMAGE_TAG,
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
$releaseImageTagHelper = Join-Path $PSScriptRoot "release-image-tag.ps1"
. $releaseImageTagHelper
$backendImageTag = Assert-ReviewedBackendImageTag -BackendImageTag $BackendImageTag
$checkedOutCommit = (git -C $repoRoot rev-parse HEAD).Trim().ToLowerInvariant()
if ($backendImageTag -ne "git-$checkedOutCommit") {
  throw "BACKEND_IMAGE_TAG must identify the checked-out reviewed commit ($checkedOutCommit)."
}

$failed = 0

function Invoke-DockerComposeConfig {
  param(
    [Parameter(Mandatory = $true)][string]$ComposePath,
    [Parameter(Mandatory = $true)][string]$BackendImageTag
  )

  $previousBackendImageTag = $env:BACKEND_IMAGE_TAG
  try {
    $env:BACKEND_IMAGE_TAG = $BackendImageTag
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($docker) {
      docker compose -f $ComposePath config > $null
      if ($LASTEXITCODE -ne 0) {
        throw "docker compose config failed"
      }
      return
    }

    $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
    if (-not $wsl) {
      throw "docker CLI not found and wsl.exe is unavailable"
    }

    $wslComposePath = $ComposePath
    if ($ComposePath -match '^([A-Za-z]):\\(.*)$') {
      $drive = $Matches[1].ToLowerInvariant()
      $rest = $Matches[2] -replace '\\', '/'
      $wslComposePath = "/mnt/$drive/$rest"
    } else {
      $wslComposePath = (wsl.exe wslpath -a $ComposePath).Trim()
    }

    wsl.exe env "BACKEND_IMAGE_TAG=$BackendImageTag" docker compose -f $wslComposePath config > $null
    if ($LASTEXITCODE -ne 0) {
      throw "wsl docker compose config failed"
    }
  } finally {
    if ($null -eq $previousBackendImageTag) {
      Remove-Item Env:BACKEND_IMAGE_TAG -ErrorAction SilentlyContinue
    } else {
      $env:BACKEND_IMAGE_TAG = $previousBackendImageTag
    }
  }
}

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
  Invoke-DockerComposeConfig -ComposePath $composePath -BackendImageTag $backendImageTag
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

# 8. Migration filename sanity
Test-Step -Label "Migration filename sanity" -Action {
  $migrations = Get-ChildItem -Path (Join-Path $backendPath "migrations") -Filter "*.sql" | Sort-Object Name
  if ($migrations.Count -eq 0) {
    throw "No migration files found"
  }

  $numbers = @()
  foreach ($m in $migrations) {
    if ($m.BaseName -notmatch '^(\d{3})_') {
      throw "Migration filename must start with NNN_: $($m.Name)"
    }
    $numbers += [int]$Matches[1]
  }

  $outOfOrder = @()
  for ($i = 1; $i -lt $numbers.Count; $i++) {
    if ($numbers[$i] -lt $numbers[$i - 1]) {
      $outOfOrder += $migrations[$i].Name
    }
  }
  if ($outOfOrder.Count -gt 0) {
    throw "Migration numeric prefixes are out of order: $($outOfOrder -join ', ')"
  }

  $uniqueNumbers = @($numbers | Sort-Object -Unique)
  $gaps = @()
  for ($expected = $uniqueNumbers[0]; $expected -le $uniqueNumbers[-1]; $expected++) {
    if ($uniqueNumbers -notcontains $expected) {
      $gaps += ('{0:D3}' -f $expected)
    }
  }
  if ($gaps.Count -gt 0) {
    Write-Host "    Warning: migration numeric gap(s): $($gaps -join ', ')" -ForegroundColor Yellow
  }

  $duplicatePrefixes = @(
    $numbers |
      Group-Object |
      Where-Object { $_.Count -gt 1 } |
      ForEach-Object { '{0:D3}' -f [int]$_.Name }
  )
  if ($duplicatePrefixes.Count -gt 0) {
    Write-Host "    Warning: duplicate migration prefix(es): $($duplicatePrefixes -join ', ')" -ForegroundColor Yellow
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

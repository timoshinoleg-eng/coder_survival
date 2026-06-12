[CmdletBinding()]
param(
  [string]$VmHost = "root@185.92.221.219",
  [string]$RemoteAppDir = "/opt/coder_survival",
  [string]$FrontendDir = "frontend",
  [string]$BotDir = "bot",
  [string]$BackendComposeFile = "docker-compose.backend.yml",
  [switch]$AllowDirty,
  [switch]$IncludeUntracked,
  [switch]$SkipVercel,
  [switch]$SkipFrontend,
  [switch]$SkipBot,
  [switch]$SkipBackend,
  [switch]$SkipSmoke
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendPath = Join-Path $repoRoot $FrontendDir
$botPath = Join-Path $repoRoot $BotDir
$smokeScript = Join-Path $PSScriptRoot "smoke-prod.ps1"
$offerSmokeScript = Join-Path $PSScriptRoot "smoke-offers.ps1"
$backendPayloadWhitelist = @(
  "backend/Dockerfile",
  "backend/package.json",
  "backend/package-lock.json",
  "backend/src/**",
  "backend/migrations/**",
  "docker-compose.backend.yml"
)
$forbiddenSecretFiles = @(
  ".env",
  "backend/.env",
  "backend/.env.production",
  "backend/.env.local"
)

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  Write-Host ""
  Write-Host "==> $Label"
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Invoke-SshScript {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SshHost,
    [Parameter(Mandatory = $true)]
    [string]$Script
  )

  $normalizedScript = $Script -replace "`r`n", "`n"
  $output = $normalizedScript | ssh $SshHost bash -s
  if ($LASTEXITCODE -ne 0) {
    throw "ssh script failed on $SshHost"
  }
  return $output
}

Write-Host "=== Coder Survival Release ==="
Write-Host "Started at: $(Get-Date -Format o)"

if (-not $AllowDirty) {
  $gitStatus = @(git -C $repoRoot status --porcelain)
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to read git status"
  }
  if ($gitStatus.Count -gt 0) {
    throw "Worktree is dirty. Commit/stash changes or rerun with -AllowDirty."
  }
}

function Get-WhitelistMatches {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath,
    [Parameter(Mandatory = $true)]
    [string[]]$Patterns
  )

  $results = New-Object System.Collections.Generic.List[string]
  $normalizedRoot = ($RootPath.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar)
  foreach ($pattern in $Patterns) {
    if ($pattern.EndsWith('/**')) {
      $relativeDir = $pattern.Substring(0, $pattern.Length - 3)
      $absoluteDir = Join-Path $RootPath $relativeDir
      if (Test-Path $absoluteDir -PathType Container) {
        Get-ChildItem -Path $absoluteDir -Recurse -File | ForEach-Object {
          $relative = $_.FullName.Substring($normalizedRoot.Length).Replace('\', '/')
          $results.Add($relative)
        }
      }
      continue
    }

    $absolutePath = Join-Path $RootPath $pattern
    if (Test-Path $absolutePath -PathType Leaf) {
      $fullPath = (Resolve-Path $absolutePath).Path
      $relative = $fullPath.Substring($normalizedRoot.Length).Replace('\', '/')
      $results.Add($relative)
    }
  }

  return @($results | Sort-Object -Unique)
}

function Test-ForbiddenSecrets {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath,
    [Parameter(Mandatory = $true)]
    [string[]]$RelativePaths
  )

  $found = @()
  foreach ($relativePath in $RelativePaths) {
    $absolutePath = Join-Path $RootPath $relativePath
    if (Test-Path $absolutePath -PathType Leaf) {
      $found += $relativePath
    }
  }

  return $found
}

if (-not $SkipVercel) {
  if (-not $SkipFrontend) {
    Invoke-Checked -Label "Vercel deploy: frontend" -Action {
      Push-Location $frontendPath
      try {
        npx vercel deploy --prod --yes
      } finally {
        Pop-Location
      }
    }.GetNewClosure()
  }

  if (-not $SkipBot) {
    Invoke-Checked -Label "Vercel deploy: bot" -Action {
      Push-Location $botPath
      try {
        npx vercel deploy --prod --yes
      } finally {
        Pop-Location
      }
    }.GetNewClosure()
  }
}

if (-not $SkipBackend) {
  $stagingDir = Join-Path $env:TEMP ("coder-survival-release-" + [guid]::NewGuid().ToString("N"))
  $zipPath = Join-Path $env:TEMP ("coder-survival-release-" + [guid]::NewGuid().ToString("N") + ".zip")

  try {
    New-Item -ItemType Directory -Path $stagingDir | Out-Null

    Write-Host ""
    Write-Host "==> Building backend release payload"
    $forbiddenSecrets = @(Test-ForbiddenSecrets -RootPath $repoRoot -RelativePaths $forbiddenSecretFiles)
    if ($forbiddenSecrets.Count -gt 0) {
      throw "Forbidden secret files found in repo tree: $($forbiddenSecrets -join ', '). Move them outside the workspace before release."
    }

    $filtered = @(Get-WhitelistMatches -RootPath $repoRoot -Patterns $backendPayloadWhitelist)
    if ($filtered.Count -eq 0) {
      throw "Backend payload whitelist resolved to an empty file set"
    }

    Write-Host "Payload manifest:"
    $filtered | ForEach-Object { Write-Host " - $_" }

    foreach ($rel in $filtered) {
      $src = Join-Path $repoRoot $rel
      if (Test-Path $src -PathType Leaf) {
        $dest = Join-Path $stagingDir $rel
        $destDir = Split-Path $dest -Parent
        if (!(Test-Path $destDir)) {
          New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item $src $dest -Force
      }
    }

    Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $zipPath -CompressionLevel Optimal -Force

    Invoke-Checked -Label "Upload backend payload to VM" -Action {
      scp -o StrictHostKeyChecking=no $zipPath "${VmHost}:/tmp/coder-survival-release.zip"
    }.GetNewClosure()

    $remoteScript = @'
set -euo pipefail
cd '__REMOTE_APP_DIR__'
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('/tmp/coder-survival-release.zip') as zf:
    zf.extractall('__REMOTE_APP_DIR__')
print('release payload extracted')
PY
rm -f /tmp/coder-survival-release.zip
docker build --no-cache -t cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest ./backend
docker compose --env-file backend/.env -f __BACKEND_COMPOSE_FILE__ run --rm backend node src/migrate.js
docker compose --env-file backend/.env -f __BACKEND_COMPOSE_FILE__ up -d --force-recreate backend
backend_container_id="$(docker compose --env-file backend/.env -f __BACKEND_COMPOSE_FILE__ ps -q backend)"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if [ -n "$backend_container_id" ] && [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$backend_container_id")" = "healthy" ]; then
    exit 0
  fi
  sleep 2
done
docker compose --env-file backend/.env -f __BACKEND_COMPOSE_FILE__ logs --tail=40 backend
exit 1
'@
    $remoteScript = $remoteScript.Replace('__REMOTE_APP_DIR__', $RemoteAppDir)
    $remoteScript = $remoteScript.Replace('__BACKEND_COMPOSE_FILE__', $BackendComposeFile)

    Write-Host ""
    Write-Host "==> Deploy backend on VM"
    $remoteOutput = Invoke-SshScript -SshHost $VmHost -Script $remoteScript
    $remoteOutput | Write-Output
  } finally {
    if (Test-Path $stagingDir) {
      Remove-Item $stagingDir -Recurse -Force
    }
    if (Test-Path $zipPath) {
      Remove-Item $zipPath -Force
    }
  }
}

if (-not $SkipSmoke) {
  Invoke-Checked -Label "Production smoke" -Action {
    & $smokeScript -VmHost $VmHost -RemoteAppDir $RemoteAppDir -BackendComposeFile $BackendComposeFile
  }.GetNewClosure()

  Invoke-Checked -Label "Offer smoke" -Action {
    & $offerSmokeScript -VmHost $VmHost -RemoteAppDir $RemoteAppDir -BackendComposeFile $BackendComposeFile
  }.GetNewClosure()
}

Write-Host ""
Write-Host "=== Release Complete ==="
Write-Host "Finished at: $(Get-Date -Format o)"

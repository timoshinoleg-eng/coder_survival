[CmdletBinding()]
param(
  [string]$VmHost = $env:CODER_SURVIVAL_VM_SSH_TARGET,
  [string]$RemoteAppDir = "/opt/coder_survival",
  [string]$FrontendDir = "frontend",
  [string]$BotDir = "bot",
  [string]$BackendComposeFile = "docker-compose.backend.yml",
  [string]$SshKeyPath = $env:CODER_SURVIVAL_SSH_KEY_PATH,
  [string]$SshKnownHostsPath = $env:CODER_SURVIVAL_SSH_KNOWN_HOSTS_PATH,
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
$smokeScript = Join-Path $PSScriptRoot "smoke-core-prod.ps1"
$backendImageRepo = "coder-survival-backend"
$gitSha = (git -C $repoRoot rev-parse --short=12 HEAD).Trim()
$backendImageTag = "git-$gitSha"
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

if ([string]::IsNullOrWhiteSpace($VmHost) -or $VmHost -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._:-]*$') {
  throw "VmHost is required in user@host form. Pass -VmHost or set CODER_SURVIVAL_VM_SSH_TARGET."
}

$sshOptions = @()
if ($SshKeyPath) {
  if (-not (Test-Path -LiteralPath $SshKeyPath -PathType Leaf)) {
    throw "Configured SSH key does not exist: $SshKeyPath"
  }
  $sshOptions += @('-i', $SshKeyPath)
}
if ($SshKnownHostsPath) {
  if (-not (Test-Path -LiteralPath $SshKnownHostsPath -PathType Leaf)) {
    throw "Configured SSH known-hosts file does not exist: $SshKnownHostsPath"
  }
  $sshOptions += @('-o', "UserKnownHostsFile=$SshKnownHostsPath", '-o', 'StrictHostKeyChecking=yes')
}

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
    [string]$Script,
    [string[]]$SshOptions = @()
  )

  $normalizedScript = $Script -replace "`r`n", "`n"
  $output = $normalizedScript | ssh @SshOptions $SshHost bash -s
  if ($LASTEXITCODE -ne 0) {
    throw "ssh script failed on $SshHost"
  }
  return $output
}

Write-Host "=== Coder Survival Release ==="
Write-Host "Started at: $(Get-Date -Format o)"
Write-Host "Backend image: ${backendImageRepo}:${backendImageTag}"
Write-Host "Backend latest alias: ${backendImageRepo}:latest"

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
      scp @sshOptions $zipPath "${VmHost}:/tmp/coder-survival-release.zip"
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
BACKEND_IMAGE_REPO='__BACKEND_IMAGE_REPO__'
BACKEND_IMAGE_TAG='__BACKEND_IMAGE_TAG__'
export BACKEND_IMAGE_TAG
docker build --no-cache -t "${BACKEND_IMAGE_REPO}:${BACKEND_IMAGE_TAG}" -t "${BACKEND_IMAGE_REPO}:latest" ./backend
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
    $remoteScript = $remoteScript.Replace('__BACKEND_IMAGE_REPO__', $backendImageRepo)
    $remoteScript = $remoteScript.Replace('__BACKEND_IMAGE_TAG__', $backendImageTag)

    Write-Host ""
    Write-Host "==> Deploy backend on VM"
    $remoteOutput = Invoke-SshScript -SshHost $VmHost -Script $remoteScript -SshOptions $sshOptions
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
  Invoke-Checked -Label "Production core smoke" -Action {
    & $smokeScript -VmHost $VmHost -RemoteAppDir $RemoteAppDir -BackendComposeFile $BackendComposeFile
  }.GetNewClosure()
}

Write-Host ""
Write-Host "=== Release Complete ==="
Write-Host "Finished at: $(Get-Date -Format o)"

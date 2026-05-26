param(
  [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$backendEnv = Join-Path $backendDir ".env"

if (-not (Test-Path $backendEnv)) {
  @"
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=coder_survival
DB_USER=postgres
DB_PASSWORD=postgres
DB_PASS=postgres
WEBAPP_URL=http://localhost:5173
INIT_DATA_MAX_AGE_SECONDS=3600
RATE_LIMIT_MAX_TAPS_PER_SECOND=15
RATE_LIMIT_SOFT_BAN_THRESHOLD=25
RATE_LIMIT_DAILY_CAP_PER_IP=10000
"@ | Set-Content -Path $backendEnv -Encoding UTF8
  Write-Host "Created backend/.env for local development"
}

docker compose -f (Join-Path $backendDir "docker-compose.yml") up -d db

Push-Location $backendDir
try {
  npm run migrate
  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd `"$backendDir`"; npm start"
  )
}
finally {
  Pop-Location
}

if (-not $SkipFrontend) {
  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd `"$frontendDir`"; npm run dev -- --host 127.0.0.1"
  )
}

Write-Host "Local MVP startup requested."
Write-Host "Backend:  http://localhost:3000/health"
Write-Host "Frontend: http://localhost:5173"

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ApiOrigin,
  [string]$FrontendConfigPath = "frontend/vercel.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($ApiOrigin.EndsWith("/")) {
  $ApiOrigin = $ApiOrigin.TrimEnd("/")
}

if ($ApiOrigin -notmatch '^https://') {
  throw "ApiOrigin must start with https://"
}

$configFullPath = Resolve-Path $FrontendConfigPath
$config = Get-Content $configFullPath -Raw | ConvertFrom-Json

if ($null -eq $config.rewrites -or $config.rewrites.Count -lt 2) {
  throw "Unexpected frontend vercel.json shape: rewrites are missing or incomplete"
}

foreach ($rewrite in $config.rewrites) {
  if ($rewrite.source -eq "/api/(.*)") {
    $rewrite.destination = "$ApiOrigin/api/`$1"
  }
  elseif ($rewrite.source -eq "/health") {
    $rewrite.destination = "$ApiOrigin/health"
  }
}

$json = $config | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configFullPath, $json + [Environment]::NewLine, $utf8NoBom)

Write-Output "Updated frontend/vercel.json"
Write-Output "API origin: $ApiOrigin"
Write-Output ""
Write-Output "Next steps:"
Write-Output "1. Review git diff frontend/vercel.json"
Write-Output "2. cd frontend"
Write-Output "3. npx vercel deploy --prod --yes"
Write-Output "4. pwsh -File scripts/smoke-prod.ps1"

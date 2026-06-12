[CmdletBinding()]
param(
  [string]$VmHost = "root@185.92.221.219",
  [string]$RemoteAppDir = "/opt/coder_survival",
  [string]$BackendComposeFile = "docker-compose.backend.yml",
  [string]$BaseUrl = "https://frontend-ashy-alpha-77.vercel.app",
  [string]$DirectApiBaseUrl = "https://coder-survival-api.duckdns.org",
  [string]$BotToken = "",
  [int]$SmokeTelegramId = 900000777,
  [string]$SmokeFirstName = "Offer",
  [string]$SmokeLastName = "Smoke",
  [string]$SmokeUsername = "offer_smoke_777"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $PSBoundParameters.ContainsKey('SmokeTelegramId')) {
  $SmokeTelegramId = 900000000 + (Get-Random -Minimum 1000 -Maximum 99999)
}

Write-Host "==> Fetching BOT_TOKEN from backend runtime"
$botToken = $BotToken
if (-not $botToken) {
  $botToken = ssh $VmHost "cd $RemoteAppDir && docker compose -f $BackendComposeFile run --rm -T backend printenv BOT_TOKEN" | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0 -or -not $botToken) {
    throw "Failed to retrieve BOT_TOKEN from backend runtime on $VmHost"
  }
  $botToken = $botToken.Trim()
}

$authDate = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$userJson = "{`"id`":$SmokeTelegramId,`"first_name`":`"$SmokeFirstName`",`"last_name`":`"$SmokeLastName`",`"username`":`"$SmokeUsername`"}"
$pairs = [ordered]@{
  auth_date = [string]$authDate
  query_id = "AAEAAAE"
  user = $userJson
}

$dataCheckString = ($pairs.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join "`n"
$utf8 = [System.Text.Encoding]::UTF8
$secretHmac = [System.Security.Cryptography.HMACSHA256]::new($utf8.GetBytes("WebAppData"))
$secretKey = $secretHmac.ComputeHash($utf8.GetBytes($botToken))
$secretHmac.Dispose()
$hashHmac = [System.Security.Cryptography.HMACSHA256]::new($secretKey)
$hashBytes = $hashHmac.ComputeHash($utf8.GetBytes($dataCheckString))
$hashHmac.Dispose()
$hash = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })

$queryParts = @(
  "auth_date=$([System.Uri]::EscapeDataString([string]$authDate))"
  "query_id=$([System.Uri]::EscapeDataString('AAEAAAE'))"
  "user=$([System.Uri]::EscapeDataString($userJson))"
  "hash=$hash"
)
$initData = $queryParts -join "&"

$headers = @{ "x-telegram-init-data" = $initData }
$jsonHeaders = @{ "x-telegram-init-data" = $initData; "Content-Type" = "application/json" }

function Get-OfferType {
  param($State)
  if ($null -eq $State) {
    return $null
  }

  if ($State.PSObject.Properties.Name -contains "contextOffer" -and $null -ne $State.contextOffer) {
    return $State.contextOffer.type
  }

  return $null
}

Write-Host "==> Loading initial state"
$state = Invoke-RestMethod "$DirectApiBaseUrl/api/state" -Headers $headers -Method Get
$sessionId = $state.activeSession.sessionId
Write-Host ("start energy={0}; offer={1}" -f $state.game.energy, (Get-OfferType -State $state))

Write-Host "==> Driving energy into contextual-offer range"
for ($attempt = 1; $attempt -le 120; $attempt += 1) {
  $state = Invoke-RestMethod "$DirectApiBaseUrl/api/state" -Headers $headers -Method Get
  $currentOffer = Get-OfferType -State $state
  if ($currentOffer) {
    break
  }

  try {
    $tap = Invoke-RestMethod "$DirectApiBaseUrl/api/tap" -Headers $jsonHeaders -Method Post -Body (@{ session_id = $sessionId } | ConvertTo-Json -Compress)
    $tapOffer = Get-OfferType -State $tap
    if ($tapOffer) {
      break
    }
  } catch {
    if ($_.Exception.Message -match "429") {
      Start-Sleep -Seconds 2
      continue
    }
    throw
  }

  if ($attempt % 10 -eq 0) {
    Write-Host ("attempt={0}; energy={1}" -f $attempt, $state.game.energy)
  }

  Start-Sleep -Milliseconds 125
}

$stateAfterTap = Invoke-RestMethod "$DirectApiBaseUrl/api/state" -Headers $headers -Method Get
$offerAfterTap = Get-OfferType -State $stateAfterTap
Write-Host ("after taps energy={0}; directOffer={1}" -f $stateAfterTap.game.energy, $offerAfterTap)
if (-not $offerAfterTap) {
  throw "No direct contextOffer became available"
}

Write-Host "==> Dismissing offer on direct API"
$dismiss = Invoke-RestMethod "$DirectApiBaseUrl/api/offers/dismiss" -Headers $jsonHeaders -Method Post -Body (@{ offerType = $offerAfterTap } | ConvertTo-Json -Compress)
Write-Host ("dismiss success={0}; type={1}" -f $dismiss.success, $dismiss.offerType)

$stateAfterDismiss = Invoke-RestMethod "$DirectApiBaseUrl/api/state" -Headers $headers -Method Get
$offerAfterDismiss = Get-OfferType -State $stateAfterDismiss
Write-Host ("after dismiss directOffer={0}" -f $offerAfterDismiss)
if ($offerAfterDismiss) {
  throw "Offer still visible on direct API after dismiss"
}

Write-Host "==> Verifying Vercel proxy route"
$frontendState = Invoke-RestMethod "$BaseUrl/api/state" -Headers $headers -Method Get
$frontendOffer = Get-OfferType -State $frontendState
Write-Host ("frontend state offer={0}" -f $frontendOffer)
if ($frontendOffer) {
  throw "Offer still visible through frontend proxy after direct dismiss"
}

Write-Host "==> Offer smoke passed"

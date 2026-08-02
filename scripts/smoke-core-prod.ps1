[CmdletBinding()]
param(
  [string]$VmHost = $env:CODER_SURVIVAL_VM_SSH_TARGET,
  [string]$RemoteAppDir = "/opt/coder_survival",
  [string]$BackendComposeFile = "docker-compose.backend.yml",
  [string]$BaseUrl = "https://frontend-ashy-alpha-77.vercel.app",
  [string]$DirectApiBaseUrl = "https://coder-survival-api.duckdns.org",
  [string]$BotToken = "",
  [int]$SmokeTelegramId = 0,
  [string]$SmokeFirstName = "Smoke",
  [string]$SmokeLastName = "Core",
  [string]$SmokeUsername = "smoke_core",
  [switch]$SkipOffers
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($VmHost) -or $VmHost -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._:-]*$') {
  throw "VmHost is required in user@host form. Pass -VmHost or set CODER_SURVIVAL_VM_SSH_TARGET."
}

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
function Write-Result {
  param(
    [System.Collections.ArrayList]$Results,
    [string]$Name,
    [bool]$Ok,
    [string]$Detail
  )
  [void]$Results.Add([pscustomobject]@{
    name   = $Name
    ok     = $Ok
    detail = $Detail
  })
  $status = if ($Ok) { "PASS" } else { "FAIL" }
  Write-Host ("[{0}] {1}: {2}" -f $status, $Name, $Detail)
}

function Get-BotToken {
  param([string]$ExplicitToken)
  if ($ExplicitToken) { return $ExplicitToken.Trim() }
  if ($env:BOT_TOKEN) { return $env:BOT_TOKEN.Trim() }

  Write-Host "==> Fetching BOT_TOKEN from backend runtime"
  $token = ssh $VmHost "cd $RemoteAppDir && docker compose --env-file backend/.env -f $BackendComposeFile run --rm -T backend printenv BOT_TOKEN" | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0 -or -not $token) {
    throw "Failed to retrieve BOT_TOKEN from backend runtime on $VmHost"
  }
  return $token.Trim()
}

function Build-InitData {
  param(
    [int]$TelegramId,
    [string]$FirstName,
    [string]$LastName,
    [string]$Username
  )
  $authDate = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $userObj = @{ id = $TelegramId; first_name = $FirstName; last_name = $LastName; username = $Username }
  $userJson = ($userObj | ConvertTo-Json -Compress)
  $pairs = [ordered]@{
    auth_date = [string]$authDate
    query_id  = "AAEAAAE"
    user      = $userJson
  }
  $dataCheckString = ($pairs.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join "`n"
  $utf8 = [System.Text.Encoding]::UTF8

  $secretHmac = [System.Security.Cryptography.HMACSHA256]::new($utf8.GetBytes("WebAppData"))
  $secretKey = $secretHmac.ComputeHash($utf8.GetBytes($script:botToken))
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

  return @{
    initData    = $initData
    headers     = @{ "x-telegram-init-data" = $initData }
    jsonHeaders = @{ "x-telegram-init-data" = $initData; "Content-Type" = "application/json" }
    telegramId  = $TelegramId
  }
}

function Invoke-Api {
  param(
    [string]$Method = "Get",
    [string]$Uri,
    [hashtable]$Headers,
    [string]$Body = ""
  )
  if ($Method -eq "Get") {
    return Invoke-RestMethod -Uri $Uri -Headers $Headers -Method Get
  }
  return Invoke-RestMethod -Uri $Uri -Headers $Headers -Method $Method -Body $Body
}

function Get-StateEnergy {
  param($Payload)
  if ($null -ne $Payload.game -and $null -ne $Payload.game.energy) {
    return [double]$Payload.game.energy
  }
  if ($null -ne $Payload.progression -and $null -ne $Payload.progression.energy) {
    return [double]$Payload.progression.energy
  }
  if ($null -ne $Payload.state -and $null -ne $Payload.state.energy) {
    return [double]$Payload.state.energy
  }
  return $null
}

# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------
$script:botToken = Get-BotToken -ExplicitToken $BotToken
if (-not $script:botToken) {
  throw "BOT_TOKEN is required"
}

if (-not $PSBoundParameters.ContainsKey('SmokeTelegramId') -or $SmokeTelegramId -le 0) {
  $SmokeTelegramId = 900000000 + (Get-Random -Minimum 100000 -Maximum 999999)
}

$smokeUser = Build-InitData -TelegramId $SmokeTelegramId -FirstName $SmokeFirstName -LastName $SmokeLastName -Username $SmokeUsername
$headers = $smokeUser.headers
$jsonHeaders = $smokeUser.jsonHeaders
$results = New-Object System.Collections.ArrayList

Write-Host "==> Core smoke against $DirectApiBaseUrl (user $SmokeTelegramId)"

# -----------------------------------------------------------------------------
# 1. Public health
# -----------------------------------------------------------------------------
try {
  $health = Invoke-Api -Uri "$DirectApiBaseUrl/health" -Headers @{}
  $healthOk = ($health.status -eq "ok" -and $health.db -eq "connected")
  Write-Result -Results $results -Name "health" -Ok $healthOk -Detail ("status={0}; db={1}" -f $health.status, $health.db)
} catch {
  Write-Result -Results $results -Name "health" -Ok $false -Detail $_.Exception.Message
}

# -----------------------------------------------------------------------------
# 2. Authenticated state
# -----------------------------------------------------------------------------
$state = $null
try {
  $state = Invoke-Api -Uri "$DirectApiBaseUrl/api/state" -Headers $headers
  $stateEnergy = Get-StateEnergy -Payload $state
  $stateUserOk = ($null -ne $state.user -and [string]$state.user.telegramId -eq [string]$SmokeTelegramId)
  $stateEnergyOk = ($null -ne $stateEnergy -and $stateEnergy -ge 0)
  $stateDailyOk = ($null -ne $state.daily -and $null -ne $state.daily.total)
  $statePassPresent = ($null -ne $state.pass)
  $stateOk = ($stateUserOk -and $stateEnergyOk -and $stateDailyOk)
  Write-Result -Results $results -Name "state" -Ok $stateOk -Detail ("telegramId={0}; energy={1}; maxEnergy={2}; quests={3}; passPresent={4}; checks=user:{5},energy:{6},daily:{7}" -f $state.user.telegramId, $stateEnergy, $state.maxEnergy, $state.daily.total, $statePassPresent, $stateUserOk, $stateEnergyOk, $stateDailyOk)
} catch {
  Write-Result -Results $results -Name "state" -Ok $false -Detail $_.Exception.Message
}

# -----------------------------------------------------------------------------
# 3. Tap with default count ({})
# -----------------------------------------------------------------------------
$tap1 = $null
try {
  $tap1 = Invoke-Api -Method Post -Uri "$DirectApiBaseUrl/api/tap" -Headers $jsonHeaders -Body "{}"
  $tap1Energy = Get-StateEnergy -Payload $tap1
  $stateEnergy = Get-StateEnergy -Payload $state
  $tap1Ok = (
    $tap1.success -eq $true -and
    $null -ne $tap1.delta -and
    $tap1.delta.commits -ge 1 -and
    $tap1.tapCount -eq 1 -and
    $null -ne $tap1Energy -and
    $null -ne $stateEnergy -and
    $tap1Energy -lt $stateEnergy
  )
  Write-Result -Results $results -Name "tap-default" -Ok $tap1Ok -Detail ("commits={0}; tapCount={1}; energy={2}" -f $tap1.delta.commits, $tap1.tapCount, $tap1Energy)
} catch {
  Write-Result -Results $results -Name "tap-default" -Ok $false -Detail $_.Exception.Message
}

# Small delay to avoid triggering anti-cheat rhythmic-tap detection
Start-Sleep -Milliseconds 300

# -----------------------------------------------------------------------------
# 4. Tap with explicit count
# -----------------------------------------------------------------------------
try {
  if (-not $state -or $null -eq $stateEnergy) {
    throw "State unavailable; cannot verify tapCount=5"
  }
  if ($tap1Energy -lt 5) {
    throw "Not enough energy to test tapCount=5 (energy=$tap1Energy)"
  }
  $tapBody = @{ tapCount = 5 } | ConvertTo-Json -Compress
  $tap5 = Invoke-Api -Method Post -Uri "$DirectApiBaseUrl/api/tap" -Headers $jsonHeaders -Body $tapBody
  $tap5Energy = Get-StateEnergy -Payload $tap5
  $expectedEnergyAfter5 = $tap1Energy - 5
  $tap5Ok = (
    $tap5.success -eq $true -and
    $null -ne $tap5.delta -and
    $tap5.tapCount -eq 5 -and
    $tap5.delta.commits -ge 1 -and
    $null -ne $tap5Energy -and
    $tap5Energy -eq $expectedEnergyAfter5
  )
  Write-Result -Results $results -Name "tap-count-5" -Ok $tap5Ok -Detail ("commits={0}; tapCount={1}; energy={2}" -f $tap5.delta.commits, $tap5.tapCount, $tap5Energy)
} catch {
  Write-Result -Results $results -Name "tap-count-5" -Ok $false -Detail $_.Exception.Message
}

# -----------------------------------------------------------------------------
# 5. Active events
# -----------------------------------------------------------------------------
try {
  $events = Invoke-Api -Uri "$DirectApiBaseUrl/api/events/active" -Headers $headers
  $eventsOk = (
    $events.success -eq $true -and
    $events.PSObject.Properties.Name -contains "activeEvent" -and
    $events.PSObject.Properties.Name -contains "accountAgeMinutes"
  )
  $activeEventType = if ($events.activeEvent) { $events.activeEvent.type } else { "none" }
  Write-Result -Results $results -Name "events/active" -Ok $eventsOk -Detail ("activeEvent={0}; ageMin={1}" -f $activeEventType, $events.accountAgeMinutes)
} catch {
  Write-Result -Results $results -Name "events/active" -Ok $false -Detail $_.Exception.Message
}

# -----------------------------------------------------------------------------
# 6. Offer smoke (delegates to existing offer smoke)
# -----------------------------------------------------------------------------
if (-not $SkipOffers) {
  $offerSmokeScript = Join-Path $PSScriptRoot "smoke-offers.ps1"
  if (Test-Path $offerSmokeScript -PathType Leaf) {
    try {
      & $offerSmokeScript -VmHost $VmHost -RemoteAppDir $RemoteAppDir -BackendComposeFile $BackendComposeFile -BaseUrl $BaseUrl -DirectApiBaseUrl $DirectApiBaseUrl -BotToken $script:botToken
      Write-Result -Results $results -Name "offers" -Ok $true -Detail "smoke-offers.ps1 passed"
    } catch {
      Write-Result -Results $results -Name "offers" -Ok $false -Detail $_.Exception.Message
    }
  } else {
    Write-Result -Results $results -Name "offers" -Ok $false -Detail "smoke-offers.ps1 not found"
  }
} else {
  Write-Result -Results $results -Name "offers" -Ok $true -Detail "skipped"
}

# -----------------------------------------------------------------------------
# Report
# -----------------------------------------------------------------------------
Write-Host ""
$failed = @($results | Where-Object { -not $_.ok })
$total = $results.Count
Write-Host "=== Core smoke: $($total - $failed.Count)/$total passed ==="
if ($failed.Count -gt 0) {
  exit 1
}

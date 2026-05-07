[CmdletBinding()]
param(
  [string]$VmHost = "ubuntu@111.88.247.195",
  [string]$RemoteAppDir = "/opt/coder-survival/app",
  [string]$BackendComposeFile = "docker-compose.backend.yml",
  [string]$BaseUrl = "https://frontend-ashy-alpha-77.vercel.app",
  [string]$DirectApiBaseUrl = "https://coder-survival-api.duckdns.org",
  [string]$BotWebhookUrl = "https://coder-survival-bot.vercel.app/api/webhook",
  [string]$BotToken = "",
  [int]$SmokeTelegramId = 900000001,
  [string]$SmokeFirstName = "Smoke",
  [string]$SmokeLastName = "Tester",
  [string]$SmokeUsername = "smoke_tester"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-OptionalValue {
  param(
    $Object,
    [string[]]$Candidates
  )

  if ($null -eq $Object) {
    return $null
  }

  foreach ($candidate in $Candidates) {
    if ($Object.PSObject.Properties.Name -contains $candidate) {
      return $Object.$candidate
    }
  }

  return $null
}

function Add-Result {
  param(
    [System.Collections.ArrayList]$Results,
    [string]$Name,
    [bool]$Ok,
    [string]$Detail
  )

  [void]$Results.Add([pscustomobject]@{
    name = $Name
    ok = $Ok
    detail = $Detail
  })
}

Write-Host "==> Fetching BOT_TOKEN from backend runtime"
if (-not $PSBoundParameters.ContainsKey('SmokeTelegramId')) {
  $SmokeTelegramId = 900000000 + (Get-Random -Minimum 1000 -Maximum 99999)
}

$botToken = $BotToken
if (-not $botToken) {
  $botToken = ssh $VmHost "cd $RemoteAppDir && docker-compose -f $BackendComposeFile run --rm -T backend printenv BOT_TOKEN" | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0 -or -not $botToken) {
    throw "Failed to retrieve BOT_TOKEN from backend runtime on $VmHost"
  }
  $botToken = $botToken.Trim()
}

Write-Host "==> Fetching BOT_BACKEND_SECRET from backend runtime"
$botBackendSecret = ssh $VmHost "cd $RemoteAppDir && docker-compose -f $BackendComposeFile run --rm -T backend printenv BOT_BACKEND_SECRET" | Select-Object -Last 1
if ($LASTEXITCODE -ne 0 -or -not $botBackendSecret) {
  throw "Failed to retrieve BOT_BACKEND_SECRET from backend runtime on $VmHost"
}
$botBackendSecret = $botBackendSecret.Trim()

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
$results = New-Object System.Collections.ArrayList

try {
  $health = Invoke-RestMethod "$BaseUrl/health" -Method Get
  Add-Result -Results $results -Name "health" -Ok $true -Detail "$($health.status)/$($health.db)"
} catch {
  Add-Result -Results $results -Name "health" -Ok $false -Detail $_.Exception.Message
}

$state = $null
try {
  $state = Invoke-RestMethod "$BaseUrl/api/state" -Headers $headers -Method Get
  $passLevel = Get-OptionalValue -Object $state.pass.playerPass -Candidates @('current_level', 'currentLevel')
  Add-Result -Results $results -Name "state" -Ok $true -Detail "energy=$($state.game.energy); daily=$($state.daily.quests.Count); event=$($state.event.type); passLevel=$passLevel"
} catch {
  Add-Result -Results $results -Name "state" -Ok $false -Detail $_.Exception.Message
}

try {
  $sessionId = $null
  if ($null -ne $state -and $null -ne $state.activeSession) {
    $sessionId = $state.activeSession.sessionId
  }

  $tapBody = if ($sessionId) { @{ session_id = $sessionId } | ConvertTo-Json } else { "{}" }
  $tap = Invoke-RestMethod "$BaseUrl/api/tap" -Headers $jsonHeaders -Method Post -Body $tapBody
  $passXp = if ($null -ne $tap.pass.currentXp) { $tap.pass.currentXp } else { $tap.pass.current_xp }
  Add-Result -Results $results -Name "tap" -Ok $true -Detail "commitsDelta=$($tap.delta.commits); eventTarget=$($tap.event.target); passXp=$passXp"
} catch {
  Add-Result -Results $results -Name "tap" -Ok $false -Detail $_.Exception.Message
}

try {
  $quests = Invoke-RestMethod "$BaseUrl/api/quests/daily" -Headers $headers -Method Get
  $tapQuest = $quests.daily.quests | Where-Object { $_.questType -eq 'tap_count' }
  $commitQuest = $quests.daily.quests | Where-Object { $_.questType -eq 'commit_count' }
  $loginQuest = $quests.daily.quests | Where-Object { $_.questType -eq 'login' }
  $bonusEnergy = $quests.daily.allCompletedBonusReward.energy
  $questsOk = (
    $quests.daily.quests.Count -eq 3 -and
    $tapQuest.targetValue -eq 40 -and
    $commitQuest.targetValue -eq 80 -and
    $loginQuest.targetValue -eq 1 -and
    $bonusEnergy -eq 25
  )
  Add-Result -Results $results -Name "quests/daily" -Ok $questsOk -Detail "count=$($quests.daily.quests.Count); tap=$($tapQuest.targetValue); commits=$($commitQuest.targetValue); login=$($loginQuest.targetValue); bonusEnergy=$bonusEnergy"
} catch {
  Add-Result -Results $results -Name "quests/daily" -Ok $false -Detail $_.Exception.Message
}

try {
  $battle = Invoke-RestMethod "$BaseUrl/api/battle/today" -Headers $headers -Method Get
  $rank = if ($null -ne $battle.myPosition) { $battle.myPosition.rank } else { "n/a" }
  $battleOk = (
    $battle.rewardPreview.top1.energy -eq 50 -and
    $battle.rewardPreview.top2.energy -eq 30 -and
    $battle.rewardPreview.top3.energy -eq 15
  )
  Add-Result -Results $results -Name "battle/today" -Ok $battleOk -Detail "top=$($battle.topPlayers.Count); myRank=$rank; rewards=$($battle.rewardPreview.top1.energy)/$($battle.rewardPreview.top2.energy)/$($battle.rewardPreview.top3.energy)"
} catch {
  Add-Result -Results $results -Name "battle/today" -Ok $false -Detail $_.Exception.Message
}

try {
  $event = Invoke-RestMethod "$BaseUrl/api/event/active" -Headers $headers -Method Get
  $progress = if ($null -ne $event.myContribution) { $event.myContribution.progressPercent } else { "n/a" }
  $eventReward = $event.event.rewardPayload
  $eventOk = (
    $event.event.targetCommits -eq 650 -and
    $eventReward.energy -eq 80 -and
    $eventReward.commitsCurrent -eq 60 -and
    $eventReward.depressionRelief -eq 15
  )
  Add-Result -Results $results -Name "event/active" -Ok $eventOk -Detail "event=$($event.event.type); target=$($event.event.targetCommits); reward=$($eventReward.energy)/$($eventReward.commitsCurrent)/$($eventReward.depressionRelief); progress=$progress"
} catch {
  Add-Result -Results $results -Name "event/active" -Ok $false -Detail $_.Exception.Message
}

try {
  $pass = Invoke-RestMethod "$BaseUrl/api/pass/status" -Headers $headers -Method Get
  $currentLevel = Get-OptionalValue -Object $pass.status.playerPass -Candidates @('current_level', 'currentLevel')
  $currentXp = Get-OptionalValue -Object $pass.status.playerPass -Candidates @('current_xp', 'currentXp')
  $rewardCount = @($pass.status.rewards).Count
  $firstRequiredXp = $pass.status.rewards[0].requiredXp
  $totalRequiredXp = (@($pass.status.rewards) | Measure-Object -Property requiredXp -Sum).Sum
  $premiumPassPrice = $pass.status.premiumPassProduct.stars
  $passOk = (
    $currentXp -ge 0 -and
    $rewardCount -eq 20 -and
    $firstRequiredXp -eq 20 -and
    $totalRequiredXp -eq 915 -and
    $premiumPassPrice -eq 200
  )
  Add-Result -Results $results -Name "pass/status" -Ok $passOk -Detail "level=$currentLevel; xp=$currentXp; rewards=$rewardCount; firstXp=$firstRequiredXp; totalXp=$totalRequiredXp; premiumPrice=$premiumPassPrice"
} catch {
  Add-Result -Results $results -Name "pass/status" -Ok $false -Detail $_.Exception.Message
}

try {
  $ref = Invoke-RestMethod "$BaseUrl/api/referral/link" -Headers $headers -Method Get
  Add-Result -Results $results -Name "referral/link" -Ok $true -Detail "code=$($ref.referralCode)"
} catch {
  Add-Result -Results $results -Name "referral/link" -Ok $false -Detail $_.Exception.Message
}

try {
  $refStats = Invoke-RestMethod "$BaseUrl/api/referral/stats" -Headers $headers -Method Get
  $milestoneTargets = @($refStats.stats.milestones | ForEach-Object { $_.target })
  $milestoneRewards = @($refStats.stats.milestones | ForEach-Object { $_.reward.energy })
  $milestonesJoined = ($milestoneTargets -join ',')
  $rewardsJoined = ($milestoneRewards -join ',')
  $refOk = (
    $refStats.stats.activeThresholdCommits -eq 20 -and
    $refStats.stats.milestones.Count -eq 3 -and
    $milestonesJoined -eq '1,3,5' -and
    $rewardsJoined -eq '30,60,100'
  )
  Add-Result -Results $results -Name "referral/stats" -Ok $refOk -Detail "active=$($refStats.stats.active); threshold=$($refStats.stats.activeThresholdCommits); milestones=$milestonesJoined; rewards=$rewardsJoined"
} catch {
  Add-Result -Results $results -Name "referral/stats" -Ok $false -Detail $_.Exception.Message
}

try {
  $shop = Invoke-RestMethod "$BaseUrl/api/shop/products" -Method Get
  $prices = @{}
  foreach ($product in $shop.products) {
    $prices[$product.id] = [int]$product.stars
  }
  $shopOk = (
    $prices['energy_refill'] -eq 10 -and
    $prices['depression_cure'] -eq 40 -and
    $prices['tier_boost'] -eq 75 -and
    $prices['premium_pass'] -eq 200
  )
  Add-Result -Results $results -Name "shop/products" -Ok $shopOk -Detail "prices=energy:$($prices['energy_refill']) stress:$($prices['depression_cure']) boost:$($prices['tier_boost']) pass:$($prices['premium_pass'])"
} catch {
  Add-Result -Results $results -Name "shop/products" -Ok $false -Detail $_.Exception.Message
}

try {
  $buyPayload = Invoke-RestMethod "$BaseUrl/api/buy" -Headers $jsonHeaders -Method Post -Body (@{ item_type = "energy_refill" } | ConvertTo-Json -Compress)
  $invoiceLinkResponse = Invoke-RestMethod "https://coder-survival-bot.vercel.app/api/invoice-link" -Method Post -Headers @{ "Content-Type" = "application/json" } -Body (@{
    invoicePayload = $buyPayload.payment.payload
  } | ConvertTo-Json -Compress)
  $invoiceOk = (
    $buyPayload.success -eq $true -and
    $buyPayload.purchase.itemType -eq 'energy_refill' -and
    $buyPayload.purchase.starsAmount -eq 10 -and
    $buyPayload.payment.payload -match '^purchase:\d+:energy_refill$' -and
    $invoiceLinkResponse.url -match '^https://'
  )
  Add-Result -Results $results -Name "buy/invoice-link" -Ok $invoiceOk -Detail "item=$($buyPayload.purchase.itemType); stars=$($buyPayload.purchase.starsAmount); url=$($invoiceLinkResponse.url)"
} catch {
  Add-Result -Results $results -Name "buy/invoice-link" -Ok $false -Detail $_.Exception.Message
}

try {
  $observation = Invoke-RestMethod "$DirectApiBaseUrl/api/internal/observation/economy?days=7" -Headers @{ "X-Bot-Backend-Secret" = $botBackendSecret } -Method Get
  $observationOk = (
    $observation.success -eq $true -and
    $null -ne $observation.overview -and
    $observation.windowDays -eq 7 -and
    $observation.PSObject.Properties.Name -contains "offers" -and
    $observation.PSObject.Properties.Name -contains "quests" -and
    $observation.PSObject.Properties.Name -contains "sqlSlices" -and
    $observation.sqlSlices.PSObject.Properties.Name -contains "dauRetention" -and
    $observation.sqlSlices.PSObject.Properties.Name -contains "dailyQuests" -and
    $observation.sqlSlices.PSObject.Properties.Name -contains "contextOffers" -and
    $observation.sqlSlices.PSObject.Properties.Name -contains "weeklyHackathon" -and
    $observation.sqlSlices.PSObject.Properties.Name -contains "sprintPass" -and
    $observation.sqlSlices.PSObject.Properties.Name -contains "shopPurchases" -and
    $observation.sqlSlices.PSObject.Properties.Name -contains "economyHealth"
  )
  Add-Result -Results $results -Name "internal/observation/economy" -Ok $observationOk -Detail "users=$($observation.overview.totalUsers); dauToday=$($observation.overview.dauToday); passPlayers=$($observation.pass.players); slices=$(@($observation.sqlSlices.PSObject.Properties.Name).Count)"
} catch {
  Add-Result -Results $results -Name "internal/observation/economy" -Ok $false -Detail $_.Exception.Message
}

try {
  $teamMine = Invoke-RestMethod "$BaseUrl/api/team/my" -Headers $headers -Method Get
  if ($null -ne $teamMine.team) {
    [void](Invoke-RestMethod "$BaseUrl/api/team/leave" -Headers $jsonHeaders -Method Post -Body "{}")
  }
  Add-Result -Results $results -Name "team/my" -Ok $true -Detail "hasTeam=$([bool]$teamMine.team)"
} catch {
  Add-Result -Results $results -Name "team/my" -Ok $false -Detail $_.Exception.Message
}

try {
  $teamCreate = Invoke-RestMethod "$BaseUrl/api/team/create" -Headers $jsonHeaders -Method Post -Body (@{ name = "Smoke QA Team" } | ConvertTo-Json)
  $inviteCode = if ($teamCreate.team.PSObject.Properties.Name -contains "inviteCode") { $teamCreate.team.inviteCode } else { $teamCreate.team.invite_code }
  Add-Result -Results $results -Name "team/create" -Ok $true -Detail "code=$inviteCode"
} catch {
  Add-Result -Results $results -Name "team/create" -Ok $false -Detail $_.Exception.Message
}

try {
  $teamLb = Invoke-RestMethod "$BaseUrl/api/team/leaderboard" -Headers $headers -Method Get
  Add-Result -Results $results -Name "team/leaderboard" -Ok $true -Detail "teams=$($teamLb.leaderboard.Count)"
} catch {
  Add-Result -Results $results -Name "team/leaderboard" -Ok $false -Detail $_.Exception.Message
}

try {
  [void](Invoke-RestMethod "$BaseUrl/api/team/leave" -Headers $jsonHeaders -Method Post -Body "{}")
  Add-Result -Results $results -Name "team/leave" -Ok $true -Detail "left"
} catch {
  Add-Result -Results $results -Name "team/leave" -Ok $false -Detail $_.Exception.Message
}

try {
  $botResponse = curl.exe -s -o NUL -w "%{http_code}" $BotWebhookUrl
  $botOk = $botResponse -in @("401", "405")
  Add-Result -Results $results -Name "bot/webhook" -Ok $botOk -Detail "http=$botResponse"
} catch {
  Add-Result -Results $results -Name "bot/webhook" -Ok $false -Detail $_.Exception.Message
}

$results | ForEach-Object {
  Write-Output ("{0}`t{1}`t{2}" -f $_.name, $_.ok, $_.detail)
}

$failed = @($results | Where-Object { -not $_.ok })
if ($failed.Count -gt 0) {
  exit 1
}

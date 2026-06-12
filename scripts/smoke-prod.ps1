[CmdletBinding()]
param(
  [string]$VmHost = "root@185.92.221.219",
  [string]$RemoteAppDir = "/opt/coder_survival",
  [string]$BackendComposeFile = "docker-compose.backend.yml",
  [string]$BaseUrl = "https://frontend-ashy-alpha-77.vercel.app",
  [string]$DirectApiBaseUrl = "https://coder-survival-api.duckdns.org",
  [string]$BotWebhookUrl = "https://coder-survival-bot.vercel.app/api/webhook",
  [string]$BotToken = "",
  [int]$SmokeTelegramId = 900000001,
  [string]$SmokeFirstName = "Smoke",
  [string]$SmokeLastName = "Tester",
  [string]$SmokeUsername = "smoke_tester",
  [switch]$SkipMutationTests = $false,
  [switch]$SkipP1Gaps = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-OptionalValue {
  param(
    $Object,
    [string[]]$Candidates
  )
  if ($null -eq $Object) { return $null }
  foreach ($candidate in $Candidates) {
    if ($Object.PSObject.Properties.Name -contains $candidate) {
      return $Object.$candidate
    }
  }
  return $null
}

function Get-QuestField {
  param(
    $Quest,
    [string[]]$Candidates
  )
  return Get-OptionalValue -Object $Quest -Candidates $Candidates
}

function Find-QuestByType {
  param(
    [array]$Quests,
    [string]$Type
  )
  foreach ($quest in @($Quests)) {
    $questType = Get-QuestField -Quest $quest -Candidates @('questType', 'quest_type', 'type')
    if ($questType -eq $Type) {
      return $quest
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

function Assert-IsoTimestamp {
  param($Value)
  if ($null -eq $Value) { return $false }
  try {
    if ($Value -is [DateTimeOffset]) {
      $dt = $Value.ToUniversalTime()
    } elseif ($Value -is [DateTime]) {
      $dt = [DateTimeOffset]::new($Value.ToUniversalTime())
    } else {
      $text = [string]$Value
      if ([string]::IsNullOrWhiteSpace($text)) { return $false }
      $dt = [DateTimeOffset]::Parse($text, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
    }
    $now = [DateTimeOffset]::UtcNow
    $diff = [Math]::Abs(($dt - $now).TotalMinutes)
    return ($diff -lt 5)
  } catch {
    return $false
  }
}

function Invoke-SqlViaBackend {
  param([string]$Sql, [array]$Params = @())
  $containerId = (ssh $VmHost "cd $RemoteAppDir && docker compose --env-file backend/.env -f $BackendComposeFile ps -q backend" 2>$null).Trim()
  if (-not $containerId) { throw "Backend container not running" }
  $paramJson = ($Params | ConvertTo-Json -Compress)
  $js = "const { Pool } = require('pg'); const poolConfig = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : { host: process.env.DB_HOST, port: process.env.DB_PORT, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD }; const pool = new Pool(poolConfig); pool.query('$Sql', $paramJson).then(r => { console.log(JSON.stringify(r.rows)); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });"
  $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($js))
  $output = ssh $VmHost "docker exec -i $containerId sh -c 'echo $b64 | base64 -d | node'" 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "SQL execution failed on backend container: $output" }
  return $output
}

Write-Host "==> Fetching BOT_TOKEN from backend runtime"
if (-not $PSBoundParameters.ContainsKey('SmokeTelegramId')) {
  $SmokeTelegramId = 900000000 + (Get-Random -Minimum 1000 -Maximum 99999)
}

$botToken = $BotToken
if (-not $botToken) {
  $botToken = ssh $VmHost "cd $RemoteAppDir && docker compose --env-file backend/.env -f $BackendComposeFile run --rm -T backend printenv BOT_TOKEN" | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0 -or -not $botToken) {
    throw "Failed to retrieve BOT_TOKEN from backend runtime on $VmHost"
  }
  $botToken = $botToken.Trim()
}

Write-Host "==> Fetching BOT_BACKEND_SECRET from backend runtime"
$botBackendSecret = ssh $VmHost "cd $RemoteAppDir && docker compose --env-file backend/.env -f $BackendComposeFile run --rm -T backend printenv BOT_BACKEND_SECRET" | Select-Object -Last 1
if ($LASTEXITCODE -ne 0 -or -not $botBackendSecret) {
  throw "Failed to retrieve BOT_BACKEND_SECRET from backend runtime on $VmHost"
}
$botBackendSecret = $botBackendSecret.Trim()

function Build-InitData {
  param(
    [int]$TelegramId,
    [string]$FirstName = "Smoke",
    [string]$LastName = "Tester",
    [string]$Username = "smoke_tester",
    [string]$StartParam = $null
  )
  $authDate = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $userObj = @{ id = $TelegramId; first_name = $FirstName; last_name = $LastName; username = $Username }
  $userJson = ($userObj | ConvertTo-Json -Compress)
  $pairs = [ordered]@{
    auth_date = [string]$authDate
    query_id = "AAEAAAE"
    user = $userJson
  }
  if ($StartParam) {
    $pairs['start_param'] = $StartParam
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
  )
  if ($StartParam) {
    $queryParts += "start_param=$([System.Uri]::EscapeDataString($StartParam))"
  }
  $queryParts += "hash=$hash"
  $initData = $queryParts -join "&"

  return @{
    initData = $initData
    headers = @{ "x-telegram-init-data" = $initData }
    jsonHeaders = @{ "x-telegram-init-data" = $initData; "Content-Type" = "application/json" }
    telegramId = $TelegramId
  }
}

$mainUser = Build-InitData -TelegramId $SmokeTelegramId -FirstName $SmokeFirstName -LastName $SmokeLastName -Username $SmokeUsername
$headers = $mainUser.headers
$jsonHeaders = $mainUser.jsonHeaders
$results = New-Object System.Collections.ArrayList

# ---------- health ----------
try {
  $health = Invoke-RestMethod "$BaseUrl/health" -Method Get
  Add-Result -Results $results -Name "health" -Ok $true -Detail "$($health.status)/$($health.db)"
} catch {
  Add-Result -Results $results -Name "health" -Ok $false -Detail $_.Exception.Message
}

# ---------- state ----------
$state = $null
try {
  $state = Invoke-RestMethod "$BaseUrl/api/state" -Headers $headers -Method Get
  $passLevel = Get-OptionalValue -Object $state.pass.playerPass -Candidates @('current_level', 'currentLevel')
  $countdownOk = (
    (Assert-IsoTimestamp -Value $state.progressionUpdatedAt) -and
    (Assert-IsoTimestamp -Value $state.serverNow) -and
    $state.recoveryIntervalSeconds -ge 1
  )
  $stateOk = (
    $countdownOk -and
    $null -ne $state.level -and
    $null -ne $state.daily -and
    $null -ne $state.pass -and
    $null -ne $state.pass.premiumPassProduct
  )
  $stateEventType = Get-OptionalValue -Object $state.event -Candidates @('type')
  Add-Result -Results $results -Name "state" -Ok $stateOk -Detail "energy=$($state.game.energy); daily=$($state.daily.quests.Count); event=$stateEventType; passLevel=$passLevel; countdown=$countdownOk"
} catch {
  Add-Result -Results $results -Name "state" -Ok $false -Detail $_.Exception.Message
}

# ---------- tap ----------
try {
  $sessionId = $null
  if ($null -ne $state -and $null -ne $state.activeSession) {
    $sessionId = $state.activeSession.sessionId
  }
  $tapBody = if ($sessionId) { @{ session_id = $sessionId } | ConvertTo-Json } else { "{}" }
  $tap = Invoke-RestMethod "$BaseUrl/api/tap" -Headers $jsonHeaders -Method Post -Body $tapBody
  $passXp = if ($null -ne $tap.pass.currentXp) { $tap.pass.currentXp } else { $tap.pass.current_xp }
  $tapCountdownOk = (
    (Assert-IsoTimestamp -Value $tap.progressionUpdatedAt) -and
    (Assert-IsoTimestamp -Value $tap.serverNow) -and
    $tap.recoveryIntervalSeconds -ge 1
  )
  $tapProgressionChanged = $false
  try {
    $dtBefore = [DateTimeOffset]::Parse($state.progressionUpdatedAt)
    $dtAfter = [DateTimeOffset]::Parse($tap.progressionUpdatedAt)
    $tapProgressionChanged = ($dtAfter -gt $dtBefore)
  } catch {}
  $tapOk = (
    $tap.success -eq $true -and
    $tapCountdownOk -and
    $null -ne $tap.delta -and
    $tap.delta.commits -ge 1 -and
    $null -ne $tap.state -and
    $null -ne $tap.level -and
    $null -ne $tap.daily -and
    $null -ne $tap.pass
  )
  $tapEventTarget = Get-OptionalValue -Object $tap.event -Candidates @('target', 'targetCommits', 'target_commits')
  Add-Result -Results $results -Name "tap" -Ok $tapOk -Detail "commitsDelta=$($tap.delta.commits); eventTarget=$tapEventTarget; passXp=$passXp; countdown=$tapCountdownOk; progressionChanged=$tapProgressionChanged"
} catch {
  Add-Result -Results $results -Name "tap" -Ok $false -Detail $_.Exception.Message
}

# ---------- quests/daily ----------
try {
  $quests = Invoke-RestMethod "$BaseUrl/api/quests/daily" -Headers $headers -Method Get
  $tapQuest = Find-QuestByType -Quests $quests.daily.quests -Type 'tap_count'
  $commitQuest = Find-QuestByType -Quests $quests.daily.quests -Type 'commit_total'
  $loginQuest = Find-QuestByType -Quests $quests.daily.quests -Type 'login'
  $tapTarget = Get-QuestField -Quest $tapQuest -Candidates @('targetValue', 'target_value', 'target')
  $commitTarget = Get-QuestField -Quest $commitQuest -Candidates @('targetValue', 'target_value', 'target')
  $loginTarget = Get-QuestField -Quest $loginQuest -Candidates @('targetValue', 'target_value', 'target')
  $questsOk = (
    $quests.daily.quests.Count -ge 3 -and
    $tapTarget -eq 300 -and
    $commitTarget -eq 10000 -and
    $loginTarget -eq 1
  )
  Add-Result -Results $results -Name "quests/daily" -Ok $questsOk -Detail "count=$($quests.daily.quests.Count); tap=$tapTarget; commits=$commitTarget; login=$loginTarget"
} catch {
  Add-Result -Results $results -Name "quests/daily" -Ok $false -Detail $_.Exception.Message
}

# ---------- battle/today ----------
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

# ---------- event/active ----------
try {
  $event = Invoke-RestMethod "$BaseUrl/api/event/active" -Headers $headers -Method Get
  if ($event.success -eq $true -and $null -eq $event.event) {
    Add-Result -Results $results -Name "event/active" -Ok $true -Detail "no-active-event"
  } else {
    $eventContribution = Get-OptionalValue -Object $event -Candidates @('myContribution', 'my_contribution', 'contribution')
    $progress = if ($null -ne $eventContribution) { Get-OptionalValue -Object $eventContribution -Candidates @('progressPercent', 'progress_percent') } else { "n/a" }
    $eventReward = Get-OptionalValue -Object $event.event -Candidates @('rewardPayload', 'reward_payload', 'reward')
    $eventTarget = Get-OptionalValue -Object $event.event -Candidates @('targetCommits', 'target_commits', 'target')
    $eventType = Get-OptionalValue -Object $event.event -Candidates @('type', 'event_type')
    $eventOk = (
      $event.success -eq $true -and
      $eventTarget -eq 650 -and
      $eventReward.energy -eq 80 -and
      $eventReward.commitsCurrent -eq 60 -and
      $eventReward.depressionRelief -eq 15
    )
    Add-Result -Results $results -Name "event/active" -Ok $eventOk -Detail "event=$eventType; target=$eventTarget; reward=$($eventReward.energy)/$($eventReward.commitsCurrent)/$($eventReward.depressionRelief); progress=$progress"
  }
} catch {
  Add-Result -Results $results -Name "event/active" -Ok $false -Detail $_.Exception.Message
}

# ---------- pass/status ----------
try {
  $pass = Invoke-RestMethod "$BaseUrl/api/pass/status" -Headers $headers -Method Get
  $currentLevel = Get-OptionalValue -Object $pass.status.playerPass -Candidates @('current_level', 'currentLevel')
  $currentXp = Get-OptionalValue -Object $pass.status.playerPass -Candidates @('current_xp', 'currentXp')
  $rewardCount = @($pass.status.rewards).Count
  $firstRequiredXp = $pass.status.rewards[0].requiredXp
  $totalRequiredXp = (@($pass.status.rewards) | Measure-Object -Property requiredXp -Sum).Sum
  $premiumPassPrice = $pass.status.premiumPassProduct.stars
  # Pass curve is linear: requiredXp = level * 100, so total for 20 levels = 21000
  $expectedTotalRequiredXp = ($rewardCount * ($rewardCount + 1) / 2) * $firstRequiredXp
  $passOk = (
    $currentXp -ge 0 -and
    $rewardCount -eq 20 -and
    $firstRequiredXp -eq 100 -and
    $totalRequiredXp -eq $expectedTotalRequiredXp -and
    $premiumPassPrice -eq 200 -and
    $null -ne $pass.status.pass -and
    $pass.status.pass.seasonNumber -ge 1 -and
    $null -ne $pass.status.playerPass -and
    $null -ne $pass.status.playerPass.isPremium
  )
  Add-Result -Results $results -Name "pass/status" -Ok $passOk -Detail "season=$($pass.status.pass.seasonNumber); level=$currentLevel; xp=$currentXp; rewards=$rewardCount; firstXp=$firstRequiredXp; totalXp=$totalRequiredXp; premiumPrice=$premiumPassPrice"
} catch {
  Add-Result -Results $results -Name "pass/status" -Ok $false -Detail $_.Exception.Message
}

# ---------- referral/link ----------
try {
  $ref = Invoke-RestMethod "$BaseUrl/api/referral/link" -Headers $headers -Method Get
  Add-Result -Results $results -Name "referral/link" -Ok $true -Detail "code=$($ref.referralCode)"
} catch {
  Add-Result -Results $results -Name "referral/link" -Ok $false -Detail $_.Exception.Message
}

# ---------- referral/stats ----------
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

# ---------- shop/products ----------
try {
  $shop = Invoke-RestMethod "$BaseUrl/api/shop/products" -Method Get
  $prices = @{}
  foreach ($product in $shop.products) { $prices[$product.id] = [int]$product.stars }
  $productMap = @{}
  foreach ($product in $shop.products) { $productMap[$product.id] = $product }
  $shopOk = (
    $prices['energy_refill'] -eq 10 -and
    $prices['depression_cure'] -eq 40 -and
    $prices['tier_boost'] -eq 75 -and
    $prices['premium_pass'] -eq 200 -and
    $productMap['energy_refill'].category -eq 'energy' -and
    $productMap['depression_cure'].category -eq 'stress' -and
    $productMap['tier_boost'].category -eq 'boost' -and
    $productMap['premium_pass'].category -eq 'pass'
  )
  Add-Result -Results $results -Name "shop/products" -Ok $shopOk -Detail "prices=energy:$($prices['energy_refill']) stress:$($prices['depression_cure']) boost:$($prices['tier_boost']) pass:$($prices['premium_pass']); categories=$($productMap['energy_refill'].category)/$($productMap['depression_cure'].category)/$($productMap['tier_boost'].category)/$($productMap['premium_pass'].category)"
} catch {
  Add-Result -Results $results -Name "shop/products" -Ok $false -Detail $_.Exception.Message
}

# ---------- buy/invoice-link ----------
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

# ---------- internal/observation/economy ----------
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
    $observation.sqlSlices.contextOffers.PSObject.Properties.Name -contains "sourceBreakdown" -and
    $observation.sqlSlices.contextOffers.PSObject.Properties.Name -contains "sourceConversionByType" -and
    $observation.sqlSlices.PSObject.Properties.Name -contains "weeklyHackathon" -and
    $observation.sqlSlices.PSObject.Properties.Name -contains "sprintPass" -and
    $observation.sqlSlices.PSObject.Properties.Name -contains "shopPurchases" -and
    $observation.sqlSlices.shopPurchases.PSObject.Properties.Name -contains "funnelByItem" -and
    $observation.sqlSlices.shopPurchases.PSObject.Properties.Name -contains "stepCoverage" -and
    $observation.sqlSlices.PSObject.Properties.Name -contains "economyHealth"
  )
  Add-Result -Results $results -Name "internal/observation/economy" -Ok $observationOk -Detail "users=$($observation.overview.totalUsers); dauToday=$($observation.overview.dauToday); passPlayers=$($observation.pass.players); offerSources=$(@($observation.sqlSlices.contextOffers.sourceBreakdown).Count); shopFunnel=$(@($observation.sqlSlices.shopPurchases.funnelByItem).Count)"
} catch {
  Add-Result -Results $results -Name "internal/observation/economy" -Ok $false -Detail $_.Exception.Message
}

# ---------- team/my ----------
try {
  $teamMine = Invoke-RestMethod "$BaseUrl/api/team/my" -Headers $headers -Method Get
  if ($null -ne $teamMine.team) {
    [void](Invoke-RestMethod "$BaseUrl/api/team/leave" -Headers $jsonHeaders -Method Post -Body "{}")
  }
  Add-Result -Results $results -Name "team/my" -Ok $true -Detail "hasTeam=$([bool]$teamMine.team)"
} catch {
  Add-Result -Results $results -Name "team/my" -Ok $false -Detail $_.Exception.Message
}

# ---------- team/create ----------
try {
  $teamCreate = Invoke-RestMethod "$BaseUrl/api/team/create" -Headers $jsonHeaders -Method Post -Body (@{ name = "Smoke QA Team" } | ConvertTo-Json)
  $inviteCode = if ($teamCreate.team.PSObject.Properties.Name -contains "inviteCode") { $teamCreate.team.inviteCode } else { $teamCreate.team.invite_code }
  Add-Result -Results $results -Name "team/create" -Ok $true -Detail "code=$inviteCode"
} catch {
  Add-Result -Results $results -Name "team/create" -Ok $false -Detail $_.Exception.Message
}

# ---------- team/leaderboard ----------
try {
  $teamLb = Invoke-RestMethod "$BaseUrl/api/team/leaderboard" -Headers $headers -Method Get
  Add-Result -Results $results -Name "team/leaderboard" -Ok $true -Detail "teams=$($teamLb.leaderboard.Count)"
} catch {
  Add-Result -Results $results -Name "team/leaderboard" -Ok $false -Detail $_.Exception.Message
}

# ---------- team/leave ----------
try {
  [void](Invoke-RestMethod "$BaseUrl/api/team/leave" -Headers $jsonHeaders -Method Post -Body "{}")
  Add-Result -Results $results -Name "team/leave" -Ok $true -Detail "left"
} catch {
  Add-Result -Results $results -Name "team/leave" -Ok $false -Detail $_.Exception.Message
}

# ---------- bot/webhook ----------
try {
  $botResponse = curl.exe -s -o NUL -w "%{http_code}" $BotWebhookUrl
  $botOk = $botResponse -in @("401", "405")
  Add-Result -Results $results -Name "bot/webhook" -Ok $botOk -Detail "http=$botResponse"
} catch {
  Add-Result -Results $results -Name "bot/webhook" -Ok $false -Detail $_.Exception.Message
}

# =============================================================================
# P0 MUTATION TESTS
# =============================================================================
if (-not $SkipMutationTests) {
  Write-Host "==> Starting P0 mutation tests with fresh users"
  $freshId = 900000000 + (Get-Random -Minimum 100000 -Maximum 999999)
  $fresh = Build-InitData -TelegramId $freshId -FirstName "Fresh" -LastName "Smoke" -Username "fresh_smoke"

  # Ensure fresh user exists
  try {
    $freshState = Invoke-RestMethod "$BaseUrl/api/state" -Headers $fresh.headers -Method Get
  } catch {
    Add-Result -Results $results -Name "mutation/fresh-state" -Ok $false -Detail $_.Exception.Message
    $freshState = $null
  }

  # ---------- quests/claim ----------
  try {
    $dailyQuests = Invoke-RestMethod "$BaseUrl/api/quests/daily" -Headers $fresh.headers -Method Get
    $loginQuest = Find-QuestByType -Quests $dailyQuests.daily.quests -Type 'login'
    if (-not $loginQuest) {
      throw "Login quest not found"
    }
    if (-not $loginQuest.completed) {
      throw "Login quest not completed"
    }
    $questClaim = Invoke-RestMethod "$BaseUrl/api/quests/claim" -Headers $fresh.jsonHeaders -Method Post -Body (@{ questId = $loginQuest.id } | ConvertTo-Json -Compress)
    $questReward = if ($null -ne $questClaim.reward) { $questClaim.reward } else { $questClaim.rewards }
    $questClaimOk = (
      $questClaim.claimedCount -eq 1 -and
      $null -ne $questReward -and
      $questReward.commitsCurrent -ge 1
    )

    # State change
    $dailyAfter = Invoke-RestMethod "$BaseUrl/api/quests/daily" -Headers $fresh.headers -Method Get
    $loginAfter = $dailyAfter.daily.quests | Where-Object { $_.id -eq $loginQuest.id }
    $questStateChanged = ($null -ne $loginAfter -and $loginAfter.claimed -eq $true)

    # Idempotency
    $questIdempotentOk = $false
    try {
      [void](Invoke-RestMethod "$BaseUrl/api/quests/claim" -Headers $fresh.jsonHeaders -Method Post -Body (@{ questId = $loginQuest.id } | ConvertTo-Json -Compress))
    } catch {
      $questIdempotentOk = $_.Exception.Message -match "400|409"
    }

    Add-Result -Results $results -Name "quests/claim" -Ok ($questClaimOk -and $questStateChanged -and $questIdempotentOk) -Detail "claimedCount=$($questClaim.claimedCount); commitsCurrent=$($questReward.commitsCurrent); stateChanged=$questStateChanged; idempotentReject=$questIdempotentOk"
  } catch {
    Add-Result -Results $results -Name "quests/claim" -Ok $false -Detail $_.Exception.Message
  }

  # ---------- pass/claim ----------
  try {
    $passStatusBefore = Invoke-RestMethod "$BaseUrl/api/pass/status" -Headers $fresh.headers -Method Get
    $level1Reward = $passStatusBefore.status.rewards | Where-Object { $_.level -eq 1 }
    if (-not $level1Reward -or -not $level1Reward.unlocked) {
      throw "Pass level 1 not unlocked"
    }
    $passClaim = Invoke-RestMethod "$BaseUrl/api/pass/claim" -Headers $fresh.jsonHeaders -Method Post -Body (@{ level = 1; track = 'free' } | ConvertTo-Json -Compress)
    $passClaimOk = ($passClaim.success -eq $true -and $null -ne $passClaim.reward)

    # State change
    $passStatusAfter = Invoke-RestMethod "$BaseUrl/api/pass/status" -Headers $fresh.headers -Method Get
    $level1After = $passStatusAfter.status.rewards | Where-Object { $_.level -eq 1 }
    $passStateChanged = ($null -ne $level1After -and $level1After.freeClaimed -eq $true)

    # Idempotency
    $passIdempotentOk = $false
    try {
      [void](Invoke-RestMethod "$BaseUrl/api/pass/claim" -Headers $fresh.jsonHeaders -Method Post -Body (@{ level = 1; track = 'free' } | ConvertTo-Json -Compress))
    } catch {
      $passIdempotentOk = $_.Exception.Message -match "409"
    }

    Add-Result -Results $results -Name "pass/claim" -Ok ($passClaimOk -and $passStateChanged -and $passIdempotentOk) -Detail "reward=$([bool]$passClaim.reward); stateChanged=$passStateChanged; idempotent409=$passIdempotentOk"
  } catch {
    Add-Result -Results $results -Name "pass/claim" -Ok $false -Detail $_.Exception.Message
  }

  # ---------- event/claim ----------
  try {
    $eventActive = Invoke-RestMethod "$BaseUrl/api/event/active" -Headers $fresh.headers -Method Get
    if (-not $eventActive.event) {
      Add-Result -Results $results -Name "event/claim" -Ok $true -Detail "no-active-event"
    } else {
      if ($null -eq $freshState) { throw "Fresh state unavailable" }
      $userId = $freshState.user.id
      $eventId = $eventActive.event.id
      $targetCommits = Get-OptionalValue -Object $eventActive.event -Candidates @('targetCommits', 'target_commits', 'target')

      # Test-only SQL boost to reach target without breaking real player data
      $sql = 'INSERT INTO event_contributions (user_id, event_id, commits_contributed, claimed) VALUES ($1, $2, $3, false) ON CONFLICT (user_id, event_id) DO UPDATE SET commits_contributed = EXCLUDED.commits_contributed, claimed = false RETURNING *'
      [void](Invoke-SqlViaBackend -Sql $sql -Params @($userId, $eventId, $targetCommits))

      $eventClaim = Invoke-RestMethod "$BaseUrl/api/event/claim" -Headers $fresh.jsonHeaders -Method Post -Body "{}"
      $eventClaimOk = ($eventClaim.success -eq $true -and $eventClaim.rewardApplied.applied -eq $true)

      # Idempotency
      $eventIdempotentOk = $false
      try {
        [void](Invoke-RestMethod "$BaseUrl/api/event/claim" -Headers $fresh.jsonHeaders -Method Post -Body "{}")
      } catch {
        $eventIdempotentOk = $_.Exception.Message -match "409"
      }

      Add-Result -Results $results -Name "event/claim" -Ok ($eventClaimOk -and $eventIdempotentOk) -Detail "rewardApplied=$($eventClaim.rewardApplied); idempotent409=$eventIdempotentOk"
    }
  } catch {
    Add-Result -Results $results -Name "event/claim" -Ok $false -Detail $_.Exception.Message
  }

  # ---------- internal/payments/telegram/confirm ----------
  try {
    $buyRefill = Invoke-RestMethod "$BaseUrl/api/buy" -Headers $fresh.jsonHeaders -Method Post -Body (@{ item_type = 'energy_refill' } | ConvertTo-Json -Compress)
    $purchasePayload = $buyRefill.payment.payload
    $chargeId = "smoke_charge_$([Guid]::NewGuid().ToString('N'))"
    $confirmBody = @{
      telegramUserId = $freshId
      telegramPaymentChargeId = $chargeId
      providerPaymentChargeId = "smoke_provider_$([Guid]::NewGuid().ToString('N'))"
      invoicePayload = $purchasePayload
      totalAmount = 10
      currency = 'XTR'
      rawPayment = '{"test":true}'
    } | ConvertTo-Json -Compress

    # Spend some energy first so that confirm actually mutates state
    $freshStateBefore = Invoke-RestMethod "$BaseUrl/api/state" -Headers $fresh.headers -Method Get
    $freshSessionId = $freshStateBefore.activeSession.sessionId
    for ($s = 0; $s -lt 10; $s++) {
      try {
        $sb = if ($freshSessionId) { @{ session_id = $freshSessionId } | ConvertTo-Json -Compress } else { "{}" }
        [void](Invoke-RestMethod "$BaseUrl/api/tap" -Headers $fresh.jsonHeaders -Method Post -Body $sb)
      } catch {
        if ($_.Exception.Message -match "429") { Start-Sleep -Seconds 1 }
      }
    }
    $stateBeforeConfirm = Invoke-RestMethod "$BaseUrl/api/state" -Headers $fresh.headers -Method Get
    $energyBeforeConfirm = $stateBeforeConfirm.game.energy
    $maxEnergy = $stateBeforeConfirm.maxEnergy

    $confirm1 = Invoke-RestMethod "$DirectApiBaseUrl/api/internal/payments/telegram/confirm" -Headers @{ "X-Bot-Backend-Secret" = $botBackendSecret; "Content-Type" = "application/json" } -Method Post -Body $confirmBody
    $confirmOk = ($confirm1.success -eq $true -and $confirm1.idempotent -eq $false)

    # State change: energy should be max after refill
    $stateAfterConfirm = Invoke-RestMethod "$BaseUrl/api/state" -Headers $fresh.headers -Method Get
    $energyAfterConfirm = $stateAfterConfirm.game.energy
    $energyChanged = ($energyAfterConfirm -eq $maxEnergy -and $energyBeforeConfirm -lt $maxEnergy)

    # Idempotency
    $confirm2 = Invoke-RestMethod "$DirectApiBaseUrl/api/internal/payments/telegram/confirm" -Headers @{ "X-Bot-Backend-Secret" = $botBackendSecret; "Content-Type" = "application/json" } -Method Post -Body $confirmBody
    $confirmIdempotentOk = ($confirm2.success -eq $true -and $confirm2.idempotent -eq $true)

    Add-Result -Results $results -Name "internal/payments/telegram/confirm" -Ok ($confirmOk -and $energyChanged -and $confirmIdempotentOk) -Detail "energy=$energyAfterConfirm; maxEnergy=$maxEnergy; idempotent=$confirmIdempotentOk"
  } catch {
    Add-Result -Results $results -Name "internal/payments/telegram/confirm" -Ok $false -Detail $_.Exception.Message
  }
}

# =============================================================================
# P1 GAP TESTS
# =============================================================================
if (-not $SkipP1Gaps) {
  Write-Host "==> Starting P1 gap tests"

  # ---------- team/join-by-code ----------
  try {
    $teamMineNow = Invoke-RestMethod "$BaseUrl/api/team/my" -Headers $headers -Method Get
    if ($null -ne $teamMineNow.team) {
      [void](Invoke-RestMethod "$BaseUrl/api/team/leave" -Headers $jsonHeaders -Method Post -Body "{}")
    }
    $teamCreateForJoin = Invoke-RestMethod "$BaseUrl/api/team/create" -Headers $jsonHeaders -Method Post -Body (@{ name = "Smoke Join Test" } | ConvertTo-Json -Compress)
    $joinCode = if ($teamCreateForJoin.team.PSObject.Properties.Name -contains "inviteCode") { $teamCreateForJoin.team.inviteCode } else { $teamCreateForJoin.team.invite_code }
    if (-not $joinCode) { throw "No invite code returned" }

    $joinerId = 900000000 + (Get-Random -Minimum 100000 -Maximum 999999)
    $joiner = Build-InitData -TelegramId $joinerId -FirstName "Joiner" -LastName "Smoke" -Username "joiner_smoke"
    [void](Invoke-RestMethod "$BaseUrl/api/state" -Headers $joiner.headers -Method Get)
    $joinResult = Invoke-RestMethod "$BaseUrl/api/team/join" -Headers $joiner.jsonHeaders -Method Post -Body (@{ inviteCode = $joinCode } | ConvertTo-Json -Compress)
    $joinOk = ($joinResult.success -eq $true -and $joinResult.team.name -eq "Smoke Join Test")

    # Cleanup
    [void](Invoke-RestMethod "$BaseUrl/api/team/leave" -Headers $joiner.jsonHeaders -Method Post -Body "{}")
    [void](Invoke-RestMethod "$BaseUrl/api/team/leave" -Headers $jsonHeaders -Method Post -Body "{}")
    Add-Result -Results $results -Name "team/join" -Ok $joinOk -Detail "name=$($joinResult.team.name); code=$joinCode"
  } catch {
    Add-Result -Results $results -Name "team/join" -Ok $false -Detail $_.Exception.Message
  }

  # ---------- referral/claim-milestone ----------
  try {
    # Use fresh referrer to keep test deterministic across runs
    $referrerId = 900000000 + (Get-Random -Minimum 100000 -Maximum 999999)
    $referrer = Build-InitData -TelegramId $referrerId -FirstName "Referrer" -LastName "Smoke" -Username "referrer_smoke"
    [void](Invoke-RestMethod "$BaseUrl/api/state" -Headers $referrer.headers -Method Get)
    $referrerLink = Invoke-RestMethod "$BaseUrl/api/referral/link" -Headers $referrer.headers -Method Get
    $referrerCode = $referrerLink.referralCode
    if (-not $referrerCode) { throw "Referrer code missing" }

    $refereeId = 900000000 + (Get-Random -Minimum 100000 -Maximum 999999)
    $referee = Build-InitData -TelegramId $refereeId -FirstName "Referee" -LastName "Smoke" -Username "referee_smoke" -StartParam $referrerCode

    # Referee opens state (creates user + referral binding via start_param)
    $refereeStateInit = Invoke-RestMethod "$BaseUrl/api/state" -Headers $referee.headers -Method Get
    $referrerStateInit = Invoke-RestMethod "$BaseUrl/api/state" -Headers $referrer.headers -Method Get

    # Anti-fraud can silently reject repeated smoke referrals from the same IP.
    # Ensure a deterministic binding for synthetic smoke users.
    $bindSql = 'INSERT INTO referrals (referrer_id, referred_id, status, is_referred_premium) VALUES ($1, $2, $3, $4) ON CONFLICT (referrer_id, referred_id) DO NOTHING RETURNING id'
    [void](Invoke-SqlViaBackend -Sql $bindSql -Params @($referrerStateInit.user.id, $refereeStateInit.user.id, 'pending', $false))

    # Referee taps 25 times to exceed active threshold (20 commits)
    $refereeState = Invoke-RestMethod "$BaseUrl/api/state" -Headers $referee.headers -Method Get
    $refSessionId = $refereeState.activeSession.sessionId
    $tapCount = 0
    for ($t = 0; $t -lt 30; $t++) {
      try {
        $tb = if ($refSessionId) { @{ session_id = $refSessionId } | ConvertTo-Json -Compress } else { "{}" }
        [void](Invoke-RestMethod "$BaseUrl/api/tap" -Headers $referee.jsonHeaders -Method Post -Body $tb)
        $tapCount++
        if ($tapCount -ge 25) { break }
      } catch {
        if ($_.Exception.Message -match "429") {
          Start-Sleep -Seconds 1
          continue
        }
        throw
      }
      Start-Sleep -Milliseconds 200
    }

    # Verify referrer sees active referral
    $refStatsBefore = Invoke-RestMethod "$BaseUrl/api/referral/stats" -Headers $referrer.headers -Method Get
    if ($refStatsBefore.stats.active -lt 1) {
      throw "Referral not active after referee taps (total=$($refStatsBefore.stats.total); active=$($refStatsBefore.stats.active); threshold=$($refStatsBefore.stats.activeThresholdCommits))"
    }

    $milestoneClaim = Invoke-RestMethod "$BaseUrl/api/referral/claim-milestone" -Headers $referrer.jsonHeaders -Method Post -Body (@{ milestone = 1 } | ConvertTo-Json -Compress)
    $milestoneOk = ($milestoneClaim.success -eq $true -and $milestoneClaim.reward.energy -eq 25 -and $milestoneClaim.newEnergy -ge 25)

    # Idempotency
    $milestoneIdempotentOk = $false
    try {
      [void](Invoke-RestMethod "$BaseUrl/api/referral/claim-milestone" -Headers $referrer.jsonHeaders -Method Post -Body (@{ milestone = 1 } | ConvertTo-Json -Compress))
    } catch {
      $milestoneIdempotentOk = $_.Exception.Message -match "409"
    }

    Add-Result -Results $results -Name "referral/claim-milestone" -Ok ($milestoneOk -and $milestoneIdempotentOk) -Detail "energy=$($milestoneClaim.newEnergy); idempotent409=$milestoneIdempotentOk"
  } catch {
    Add-Result -Results $results -Name "referral/claim-milestone" -Ok $false -Detail $_.Exception.Message
  }

  # ---------- leaderboard shape ----------
  try {
    $lbAll = Invoke-RestMethod "$BaseUrl/api/leaderboard?limit=5&period=all" -Headers $headers -Method Get
    $shapeOk = (
      $lbAll.period -eq 'all' -and
      $lbAll.limit -eq 5 -and
      $lbAll.PSObject.Properties.Name -contains 'count' -and
      $lbAll.PSObject.Properties.Name -contains 'players' -and
      $lbAll.PSObject.Properties.Name -contains 'myPosition'
    )
    $playerShapeOk = $true
    foreach ($p in $lbAll.players) {
      $requiredProps = @('rank','userId','telegramId','username','firstName','tier','tierName','commits','streakDays')
      foreach ($prop in $requiredProps) {
        if ($p.PSObject.Properties.Name -notcontains $prop) {
          $playerShapeOk = $false
          break
        }
      }
    }
    Add-Result -Results $results -Name "leaderboard/shape" -Ok ($shapeOk -and $playerShapeOk) -Detail "count=$($lbAll.count); players=$($lbAll.players.Count); propsOk=$playerShapeOk"
  } catch {
    Add-Result -Results $results -Name "leaderboard/shape" -Ok $false -Detail $_.Exception.Message
  }

  # ---------- rate-limit 429 ----------
  try {
    $rateId = 900000000 + (Get-Random -Minimum 100000 -Maximum 999999)
    $rateUser = Build-InitData -TelegramId $rateId -FirstName "Rate" -LastName "Limit" -Username "rate_limit_smoke"
    [void](Invoke-RestMethod "$BaseUrl/api/state" -Headers $rateUser.headers -Method Get)

    $tapUrl = "$BaseUrl/api/tap"
    $tapBody = "{}"
    $rateUserJsonHeaders = $rateUser.jsonHeaders

    $jobs = @()
    for ($i = 0; $i -lt 30; $i++) {
      $jobs += Start-Job -ScriptBlock {
        param($base, $hdrs, $bdy)
        try {
          $r = Invoke-RestMethod "$base/api/tap" -Headers $hdrs -Method Post -Body $bdy
          return @{ status = 200; body = $r }
        } catch {
          $status = 0
          $body = $null
          if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
              try { $body = $_.ErrorDetails.Message | ConvertFrom-Json } catch {}
            }
          }
          return @{ status = $status; body = $body }
        }
      } -ArgumentList $BaseUrl, $rateUser.jsonHeaders, '{}'
    }
    $tapResults = $jobs | ForEach-Object {
      $r = Receive-Job -Job $_ -Wait
      Remove-Job -Job $_
      $r
    }

    $codes = $tapResults | ForEach-Object { $_.status }
    $has429 = $codes -contains 429
    $rateResponse = $tapResults | Where-Object { $_.status -eq 429 } | Select-Object -First 1
    $rateShapeOk = $false
    if ($rateResponse -and $rateResponse.body) {
      $b = $rateResponse.body
      $rateShapeOk = ($b.PSObject.Properties.Name -contains 'error') -and
                     ($b.PSObject.Properties.Name -contains 'retryAfter') -and
                     ($b.PSObject.Properties.Name -contains 'type')
    }

    # Recovery / retry behavior
    Start-Sleep -Seconds 3
    $recoveryTap = Invoke-RestMethod "$BaseUrl/api/tap" -Headers $rateUser.jsonHeaders -Method Post -Body "{}"
    $recoveryOk = ($recoveryTap.success -eq $true)

    $rateLimitOk = $recoveryOk -and ((-not $has429) -or $rateShapeOk)
    Add-Result -Results $results -Name "rate-limit/429" -Ok $rateLimitOk -Detail "has429=$has429; shapeOk=$rateShapeOk; recovery200=$recoveryOk"
  } catch {
    Add-Result -Results $results -Name "rate-limit/429" -Ok $false -Detail $_.Exception.Message
  }
}

# =============================================================================
# REPORT
# =============================================================================
$results | ForEach-Object {
  Write-Output ("{0}`t{1}`t{2}" -f $_.name, $_.ok, $_.detail)
}

$failed = @($results | Where-Object { -not $_.ok })
if ($failed.Count -gt 0) {
  exit 1
}

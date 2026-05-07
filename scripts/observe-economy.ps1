[CmdletBinding()]
param(
  [string]$VmHost = "ubuntu@111.88.247.195",
  [string]$RemoteAppDir = "/opt/coder-survival/app",
  [string]$BackendComposeFile = "docker-compose.backend.yml",
  [string]$DirectApiBaseUrl = "https://coder-survival-api.duckdns.org",
  [int]$Days = 7,
  [switch]$RawJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Days -lt 1 -or $Days -gt 30) {
  throw "-Days must be between 1 and 30"
}

Write-Host "==> Fetching observation secret from backend runtime"
$secret = ssh $VmHost "cd $RemoteAppDir && docker-compose -f $BackendComposeFile run --rm -T backend sh -lc 'printenv OBSERVATION_SECRET || printenv BOT_BACKEND_SECRET'" | Select-Object -Last 1
if ($LASTEXITCODE -ne 0 -or -not $secret) {
  throw "Failed to retrieve observation secret from backend runtime on $VmHost"
}
$secret = $secret.Trim()

$headers = @{
  "X-Bot-Backend-Secret" = $secret
}

Write-Host "==> Fetching economy observation report"
$report = Invoke-RestMethod "$DirectApiBaseUrl/api/internal/observation/economy?days=$Days" -Headers $headers -Method Get

if ($RawJson) {
  $report | ConvertTo-Json -Depth 10
  exit 0
}

Write-Output ("generated_at`t{0}" -f $report.generatedAt)
Write-Output ("window_days`t{0}" -f $report.windowDays)
Write-Output ("overview`tusers={0}; dau_today={1}; dau_yesterday={2}; dau_avg={3}; sessions={4}; taps={5}; commits={6}" -f `
  $report.overview.totalUsers,
  $report.overview.dauToday,
  $report.overview.dauYesterday,
  $report.overview.dauAvgWindow,
  $report.overview.sessionsTotal,
  $report.overview.tapsTotal,
  $report.overview.commitsTotal)

foreach ($row in @($report.offers.dismiss)) {
  Write-Output ("offers.dismiss`t{0}; impressions={1}; dismissed={2}; rate={3}%%" -f `
    $row.offerType,
    $row.impressions,
    $row.dismissedImpressions,
    $row.dismissRatePct)
}

foreach ($row in @($report.offers.conversion)) {
  Write-Output ("offers.conversion`t{0}; impressions={1}; intents={2}; completed={3}; intent_rate={4}%%; completed_rate={5}%%" -f `
    $row.offerType,
    $row.impressions,
    $row.purchaseIntents,
    $row.completedPurchases,
    $row.intentRatePct,
    $row.completedRatePct)
}

foreach ($row in @($report.shop)) {
  Write-Output ("shop`t{0}; intents={1}; completed={2}; pending={3}; stars={4}; completion_rate={5}%%" -f `
    $row.itemType,
    $row.intentCount,
    $row.purchasesCompleted,
    $row.purchasesPending,
    $row.starsCompleted,
    $row.completionRatePct)
}

foreach ($row in @($report.quests.fullClear)) {
  Write-Output ("quests.full_clear`t{0}; users={1}; completed={2}; claimed={3}; completed_rate={4}%%; claimed_rate={5}%%" -f `
    $row.questDate,
    $row.usersWithQuests,
    $row.fullCompletedUsers,
    $row.fullClaimedUsers,
    $row.fullCompletedRatePct,
    $row.fullClaimedRatePct)
}

Write-Output ("pass`tplayers={0}; premium={1}; conversion={2}%%; avg_level={3}; avg_xp={4}" -f `
  $report.pass.players,
  $report.pass.premiumPlayers,
  $report.pass.premiumConversionPct,
  $report.pass.avgLevel,
  $report.pass.avgXp)

if ($null -ne $report.event) {
  Write-Output ("event`t{0}; participants={1}; target_reached={2}; claimed={3}; completion_rate={4}%%; avg_progress={5}%%" -f `
    $report.event.eventType,
    $report.event.participants,
    $report.event.targetReached,
    $report.event.claimed,
    $report.event.completionRatePct,
    $report.event.avgProgressPct)
}

foreach ($row in @($report.retention)) {
  Write-Output ("retention`t{0}; cohort={1}; d1={2}; rate={3}%%" -f `
    $row.cohortDate,
    $row.cohortSize,
    $row.d1Returned,
    $row.d1RetentionPct)
}

$health = $report.sqlSlices.economyHealth.snapshot
Write-Output ("health`tavg_energy={0}; median_energy={1}; low_energy={2}; avg_stress={3}; high_stress={4}; avg_commits={5}; quest_any={6}%%" -f `
  $health.avgEnergy,
  $health.medianEnergy,
  $health.lowEnergyUsers,
  $health.avgDepression,
  $health.highStressUsers,
  $health.avgTotalCommits,
  $health.questAnyCompletionPct)

foreach ($row in @($report.sqlSlices.weeklyHackathon.commitDistribution)) {
  Write-Output ("event.bucket`t{0}; users={1}" -f `
    $row.progressBucket,
    $row.users)
}

foreach ($row in @($report.sqlSlices.sprintPass.unclaimedRewards | Select-Object -First 5)) {
  Write-Output ("pass.unclaimed`tlevel={0}; required_xp={1}; free={2}; premium={3}" -f `
    $row.level,
    $row.requiredXp,
    $row.freeUnclaimed,
    $row.premiumUnclaimed)
}

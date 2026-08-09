[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$AppBaseUrl,
  [Parameter(Mandatory = $true)]
  [string]$BotWebhookUrl,
  [Parameter(Mandatory = $true)]
  [string]$ExpectedApiHost,
  [string]$VmHost = $env:CODER_SURVIVAL_VM_SSH_TARGET,
  [string]$RemoteAppDir = "/opt/coder-survival/app",
  [int]$SmokeTelegramId = 900000001,
  [string]$SmokeFirstName = "Smoke",
  [string]$SmokeLastName = "Tester",
  [string]$SmokeUsername = "smoke_tester"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($VmHost) -or $VmHost -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._:-]*$') {
  throw "VmHost is required in user@host form. Pass -VmHost or set CODER_SURVIVAL_VM_SSH_TARGET."
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

$results = New-Object System.Collections.ArrayList

$appUri = [System.Uri]$AppBaseUrl
$botUri = [System.Uri]$BotWebhookUrl

try {
  $appDns = Resolve-DnsName $appUri.Host -ErrorAction Stop
  $ips = ($appDns | Where-Object { $_.IPAddress } | Select-Object -ExpandProperty IPAddress) -join ","
  Add-Result -Results $results -Name "dns/app" -Ok $true -Detail $ips
} catch {
  Add-Result -Results $results -Name "dns/app" -Ok $false -Detail $_.Exception.Message
}

try {
  $botDns = Resolve-DnsName $botUri.Host -ErrorAction Stop
  $ips = ($botDns | Where-Object { $_.IPAddress } | Select-Object -ExpandProperty IPAddress) -join ","
  Add-Result -Results $results -Name "dns/bot" -Ok $true -Detail $ips
} catch {
  Add-Result -Results $results -Name "dns/bot" -Ok $false -Detail $_.Exception.Message
}

try {
  $apiDns = Resolve-DnsName $ExpectedApiHost -ErrorAction Stop
  $ips = ($apiDns | Where-Object { $_.IPAddress } | Select-Object -ExpandProperty IPAddress) -join ","
  Add-Result -Results $results -Name "dns/api" -Ok $true -Detail $ips
} catch {
  Add-Result -Results $results -Name "dns/api" -Ok $false -Detail $_.Exception.Message
}

try {
  $health = Invoke-RestMethod "$AppBaseUrl/health" -Method Get
  Add-Result -Results $results -Name "health" -Ok $true -Detail "$($health.status)/$($health.db)"
} catch {
  Add-Result -Results $results -Name "health" -Ok $false -Detail $_.Exception.Message
}

try {
  $headers = curl.exe -s -D - -o NUL "$AppBaseUrl/health"
  $hostMatch = [bool]($headers -match [regex]::Escape("Server:"))
  Add-Result -Results $results -Name "tls/app" -Ok $hostMatch -Detail "health endpoint reachable over HTTPS"
} catch {
  Add-Result -Results $results -Name "tls/app" -Ok $false -Detail $_.Exception.Message
}

try {
  $botStatus = curl.exe -s -o NUL -w "%{http_code}" $BotWebhookUrl
  $ok = $botStatus -in @("401", "405")
  Add-Result -Results $results -Name "bot/webhook" -Ok $ok -Detail "http=$botStatus"
} catch {
  Add-Result -Results $results -Name "bot/webhook" -Ok $false -Detail $_.Exception.Message
}

try {
  $smokeScript = Join-Path $PSScriptRoot "smoke-prod.ps1"
  $smokeOutput = & $smokeScript `
    -VmHost $VmHost `
    -RemoteAppDir $RemoteAppDir `
    -BaseUrl $AppBaseUrl `
    -BotWebhookUrl $BotWebhookUrl `
    -SmokeTelegramId $SmokeTelegramId `
    -SmokeFirstName $SmokeFirstName `
    -SmokeLastName $SmokeLastName `
    -SmokeUsername $SmokeUsername 2>&1
  Add-Result -Results $results -Name "public/smoke" -Ok $true -Detail "smoke-prod.ps1 passed"
  $smokeOutput | Write-Output
} catch {
  Add-Result -Results $results -Name "public/smoke" -Ok $false -Detail $_.Exception.Message
}

$results | ForEach-Object {
  Write-Output ("{0}`t{1}`t{2}" -f $_.name, $_.ok, $_.detail)
}

$failed = @($results | Where-Object { -not $_.ok })
if ($failed.Count -gt 0) {
  exit 1
}

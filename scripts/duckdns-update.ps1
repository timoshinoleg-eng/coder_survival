[CmdletBinding()]
param(
  [string]$Subdomain = "coder-survival-api",
  [Parameter(Mandatory = $true)]
  [string]$Token,
  [string]$IpAddress = "111.88.247.195"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Subdomain -notmatch '^[a-z0-9-]+$') {
  throw "Subdomain must contain only lowercase letters, digits, or hyphens"
}

if ($IpAddress -notmatch '^(?:\d{1,3}\.){3}\d{1,3}$') {
  throw "IpAddress must be an IPv4 address"
}

$hostname = "$Subdomain.duckdns.org"
$updateUrl = "https://www.duckdns.org/update?domains=$Subdomain&token=$Token&ip=$IpAddress"

Write-Output "Updating DuckDNS hostname: $hostname"
Write-Output "Target IP: $IpAddress"

$response = Invoke-RestMethod -Uri $updateUrl -Method Get

if ("$response".Trim() -ne "OK") {
  throw "DuckDNS update failed: $response"
}

Write-Output "DuckDNS update accepted"
Write-Output "Hostname: https://$hostname"
Write-Output ""
Write-Output "Next steps:"
Write-Output "1. Verify DNS resolves to $IpAddress"
Write-Output "2. Provision TLS on VM for $hostname"
Write-Output "3. Run: pwsh -File scripts/set-api-origin.ps1 -ApiOrigin https://$hostname"
Write-Output "4. Redeploy frontend on Vercel"
Write-Output "5. Run: pwsh -File scripts/smoke-prod.ps1"

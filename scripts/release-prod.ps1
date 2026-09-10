[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

throw @"
scripts/release-prod.ps1 is retired and must not be used for production deployment.

Supported release paths:
  1. Frontend: GitHub Actions -> Deploy Frontend Production
  2. Backend:  GitHub Actions -> Deploy Backend to Cloud.ru

The previous local PowerShell path could deploy Vercel and an arbitrary SSH VM outside the current Cloud.ru release gates. It is intentionally fail-closed.
"@

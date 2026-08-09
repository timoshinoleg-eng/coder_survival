[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

throw "This retired script must not alter the VM proxy. Use the guarded Manual Release path and the current VM configuration documented in docs/TEST_LAUNCH_RUNBOOK.md."

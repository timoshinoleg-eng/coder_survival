#!/bin/bash
set -euo pipefail

echo "scripts/deploy.sh is deprecated."
echo "Use scripts/release-prod.ps1 from the Windows/PowerShell operator environment."
echo
echo "Recommended commands:"
echo "  pwsh -File scripts/release-prod.ps1"
echo "  pwsh -File scripts/smoke-prod.ps1"
exit 1

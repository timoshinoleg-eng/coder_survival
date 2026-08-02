#!/usr/bin/env bash
set -euo pipefail

echo "backend/deploy.sh is retired and deliberately performs no deployment." >&2
echo "Use the guarded repository release path: pwsh -File scripts/release-prod.ps1" >&2
echo "It requires an explicit CODER_SURVIVAL_VM_SSH_TARGET and passed CI." >&2
exit 64

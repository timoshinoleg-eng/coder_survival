#!/bin/bash
set -euo pipefail

echo "scripts/deploy.sh is retired and cannot deploy production." >&2
echo "Use the guarded GitHub Actions release paths instead:" >&2
echo "  Frontend: Deploy Frontend Production" >&2
echo "  Backend:  Deploy Backend to Cloud.ru" >&2
exit 1

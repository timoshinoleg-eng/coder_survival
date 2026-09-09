#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/coder-survival}"

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required on the Cloud.ru VM" >&2
  exit 1
fi

sudo apt-get update
sudo apt-get install -y ca-certificates curl nginx certbot python3-certbot-nginx

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
fi

sudo systemctl enable --now docker nginx
sudo usermod -aG docker "$USER"

mkdir -p "$APP_DIR/backups"
chmod 700 "$APP_DIR" "$APP_DIR/backups"

echo "Cloud.ru VM bootstrap complete."
echo "Re-login once so docker-group membership applies before the first GitHub deployment."
echo "Public security-group ingress should expose only SSH, HTTP and HTTPS; never PostgreSQL or port 3000."

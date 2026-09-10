#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/coder-survival}"
MIN_COMPOSE_VERSION="2.30.0"

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

compose_version="$(docker compose version --short 2>/dev/null | sed 's/^v//' || true)"
if [[ -z "$compose_version" ]] || [[ "$(printf '%s\n%s\n' "$MIN_COMPOSE_VERSION" "$compose_version" | sort -V | head -n1)" != "$MIN_COMPOSE_VERSION" ]]; then
  echo "Docker Compose >= $MIN_COMPOSE_VERSION is required; found ${compose_version:-missing}" >&2
  exit 1
fi

mkdir -p "$APP_DIR/backups"
chmod 700 "$APP_DIR" "$APP_DIR/backups"

echo "Cloud.ru VM bootstrap complete."
echo "Docker Compose $compose_version satisfies the >= $MIN_COMPOSE_VERSION raw env-file requirement."
echo "Re-login once so docker-group membership applies before the first GitHub deployment."
echo "Public security-group ingress should expose only SSH, HTTP and HTTPS; never PostgreSQL or port 3000."

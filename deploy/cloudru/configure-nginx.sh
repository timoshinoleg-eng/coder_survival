#!/usr/bin/env bash
set -euo pipefail

API_DOMAIN="${API_DOMAIN:-coder-survival-api.duckdns.org}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
ISSUE_CERTIFICATE="${ISSUE_CERTIFICATE:-false}"

if [[ ! "$API_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "Invalid API_DOMAIN" >&2
  exit 1
fi

CONF="/etc/nginx/sites-available/coder-survival-api"

sudo tee "$CONF" >/dev/null <<EOF_NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${API_DOMAIN};

    client_max_body_size 1m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }
}
EOF_NGINX

sudo ln -sfn "$CONF" /etc/nginx/sites-enabled/coder-survival-api
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

if [[ "$ISSUE_CERTIFICATE" == "true" ]]; then
  if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
    echo "LETSENCRYPT_EMAIL is required when ISSUE_CERTIFICATE=true" >&2
    exit 1
  fi
  sudo certbot --nginx \
    --non-interactive \
    --agree-tos \
    --redirect \
    --email "$LETSENCRYPT_EMAIL" \
    -d "$API_DOMAIN"
fi

printf 'nginx configured for %s\n' "$API_DOMAIN"

#!/bin/bash
# Перезапуск Coder Survival backend на VM с правильными секретами
set -e

export SOPS_AGE_KEY_FILE=/opt/coder-survival/.sops-age-key
SECRETS=/opt/c...n
DB_HOST=$(sops -d --extract '["coder_survival"]["db_host"]' "$SECRETS")
DB_PORT=$(sops -d --extract '["coder_survival"]["db_port"]' "$SECRETS")
DB_NAME=$(sops -d --extract '["coder_survival"]["db_name"]' "$SECRETS")
DB_USER=$(sops -d --extract '["coder_survival"]["db_user"]' "$SECRETS")
DB_PASSWORD=*** -d --extract '["coder_survival"]["db_password"]' "$SECRETS")
BOT_TOKEN=*** -d --extract '["coder_survival"]["bot_token"]' "$SECRETS")
WEBAPP_URL=$(sops -d --extract '["coder_survival"]["webapp_url"]' "$SECRETS")
BOT_BACKEND_SECRET=*** -d --extract '["coder_survival"]["bot_backend_secret"]' "$SECRETS")

echo "Secrets loaded. DB_HOST=$DB_HOST, DB_USER=$DB_USER"

# Остановить и удалить старый контейнер
docker stop coder-survival-backend 2>/dev/null || true
docker rm coder-survival-backend 2>/dev/null || true

# Запустить с правильными секретами
docker run -d \
  --name coder-survival-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DB_HOST="$DB_HOST" \
  -e DB_PORT="$DB_PORT" \
  -e DB_NAME="$DB_NAME" \
  -e DB_USER="$DB_USER" \
  -e DB_PASSWORD=*** \
  -e BOT_TOKEN=*** \
  -e WEBAPP_URL="$WEBAPP_URL" \
  -e BOT_BACKEND_SECRET=*** \
  coder-survival-backend:local

echo "Container restarted successfully"
docker ps --filter name=coder-survival-backend
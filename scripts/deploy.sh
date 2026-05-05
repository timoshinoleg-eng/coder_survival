#!/bin/bash
set -e

# Coder Survival — One-Command Deploy Script
# Usage: ./deploy.sh

# Configuration
REGISTRY="cr.yandex/crpduv7gci2puq300f38"
BACKEND_IMAGE="coder-survival-backend"
BOT_IMAGE="coder-survival-bot"
VM_IP="111.88.254.2"
VM_USER="ubuntu"

echo "=== Coder Survival Deploy ==="
echo "Started at: $(date)"

# 1. Build frontend
echo ""
echo "[1/6] Building frontend..."
cd frontend
npm install
npm run build
cd ..

# 2. Build backend Docker image
echo ""
echo "[2/6] Building backend Docker image..."
cd backend
docker build -t ${REGISTRY}/${BACKEND_IMAGE}:latest .
cd ..

# 3. Build bot Docker image
echo ""
echo "[3/6] Building bot Docker image..."
cd bot
docker build -t ${REGISTRY}/${BOT_IMAGE}:latest .
cd ..

# 4. Push to Yandex Container Registry
echo ""
echo "[4/6] Pushing to Yandex Container Registry..."
docker push ${REGISTRY}/${BACKEND_IMAGE}:latest
docker push ${REGISTRY}/${BOT_IMAGE}:latest

# 5. Deploy on VM via SSH
echo ""
echo "[5/6] Deploying on VM..."
ssh ${VM_USER}@${VM_IP} << 'REMOTE_SCRIPT'
  cd /opt/coder-survival || git clone https://github.com/timoshinoleg-eng/coder_survival.git /opt/coder-survival
  cd /opt/coder-survival
  git pull origin main
  
  # Login to Yandex Container Registry
  yc container registry configure-docker
  
  # Pull latest images
  docker pull cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest
  docker pull cr.yandex/crpduv7gci2puq300f38/coder-survival-bot:latest
  
  # Restart services
  docker-compose -f docker-compose.prod.yml down
  docker-compose -f docker-compose.prod.yml up -d
  
  # Health check
  sleep 5
  curl -f http://localhost:3000/health || echo "Health check failed"
REMOTE_SCRIPT

# 6. Verify
echo ""
echo "[6/6] Verifying deployment..."
curl -f http://${VM_IP}:3000/health || echo "Backend health check failed"
curl -f http://${VM_IP}:80 || echo "Nginx check failed"

echo ""
echo "=== Deploy Complete ==="
echo "Finished at: $(date)"
echo ""
echo "URLs:"
echo "  Web App: http://${VM_IP}"
echo "  API: http://${VM_IP}:3000"
echo "  Health: http://${VM_IP}:3000/health"
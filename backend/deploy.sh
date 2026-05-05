#!/bin/bash
set -e

# Build and push Coder Survival backend to Yandex Container Registry

REGISTRY="cr.yandex/crpduv7gci2puq300f38"
IMAGE="coder-survival-backend"
TAG="latest"

echo "=== Building Docker image ==="
docker build -t ${REGISTRY}/${IMAGE}:${TAG} .

echo "=== Authenticating with Yandex Container Registry ==="
# Requires yc CLI configured with container-registry credentials
# yc container registry configure-docker

echo "=== Pushing to registry ==="
docker push ${REGISTRY}/${IMAGE}:${TAG}

echo "=== Done ==="
echo "Image: ${REGISTRY}/${IMAGE}:${TAG}"
echo ""
echo "Deploy on server:"
echo "  docker pull ${REGISTRY}/${IMAGE}:${TAG}"
echo "  docker run -d -p 3000:3000 --env-file .env ${REGISTRY}/${IMAGE}:${TAG}"
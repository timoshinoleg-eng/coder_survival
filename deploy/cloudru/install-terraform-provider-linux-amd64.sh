#!/usr/bin/env bash
set -euo pipefail

VERSION='2.1.3'
PLATFORM='linux_amd64'
EXPECTED_SHA256='41b14bbf195131364d58d3f5d33face1d7f151d6b4ca6175bf6b0f6b83ede5a7'
PROVIDER_DIR="$HOME/.terraform.d/plugins/cloud.ru/cloudru/cloud/$VERSION/$PLATFORM"
PROVIDER_PATH="$PROVIDER_DIR/terraform-provider-cloud_${VERSION}_${PLATFORM}"
DOWNLOAD_URL="https://github.com/cloud-ru/evo-terraform/releases/download/v${VERSION}/terraform-provider-cloud_${VERSION}_${PLATFORM}"

mkdir -p "$PROVIDER_DIR"
curl --fail --location --silent --show-error "$DOWNLOAD_URL" --output "$PROVIDER_PATH"
printf '%s  %s\n' "$EXPECTED_SHA256" "$PROVIDER_PATH" | sha256sum --check --strict
chmod 0755 "$PROVIDER_PATH"
printf 'Installed Cloud.ru Evolution Terraform provider %s (%s)\n' "$VERSION" "$PLATFORM"

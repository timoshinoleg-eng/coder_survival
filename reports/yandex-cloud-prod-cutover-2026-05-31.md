# Yandex Cloud Production Cutover Report

Date: 2026-05-31T15:43:10 Europe/Moscow

## Production endpoint

- Frontend production alias: https://frontend-ashy-alpha-77.vercel.app
- Backend HTTPS origin: https://111-88-243-88.sslip.io
- Backend VM: cs-prod-vm-20260531 / fhme4mhnhm714sjumngd / 111.88.243.88
- Database: YC Managed PostgreSQL coder-survival-db / c9qsqk0qa49u3k6rbe5b
- Backend image: cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest @ sha256:d920cec9c43f996a6e6bd11dd74f717a50cfc5c4b2c939b7894f85d554038326
- TLS: Caddy automatic Let's Encrypt for 111-88-243-88.sslip.io

## Cutover actions

- Created new prod VM on YC Compute: 4 vCPU, 8GB RAM, 80GB network-hdd, Ubuntu 22.04.
- Installed Docker, docker-compose, PostgreSQL client, Caddy.
- Deployed backend container with real production runtime env extracted from old VM snapshot.
- Added actual production runtime values to Lockbox secret cs-prod-secrets as version e6qcm951dus70eqf4jvu.
- Updated frontend/vercel.json rewrites from coder-survival-api.duckdns.org to https://111-88-243-88.sslip.io.
- Deployed frontend production alias frontend-ashy-alpha-77.vercel.app.
- Updated Vercel bot API_URL to https://111-88-243-88.sslip.io and redeployed coder-survival-bot.vercel.app.
- Detached and deleted temporary rescue disk cs-prod-old-boot-rescue from staging after extracting env.

## Verification evidence

- Direct backend health: 200, db=connected.
- Frontend /health rewrite: 200, db=connected.
- Direct /api/state with signed Telegram initData: 200.
- Frontend /api/state rewrite with signed Telegram initData: 200.
- Direct /api/meme?templateId=wtf_per_minute&format=1:1: 200 image/png, 2006 bytes.
- Frontend /api/meme rewrite: 200 image/png, 2006 bytes.
- Bot API_URL check via invoice-link invalid payload: backend returned expected Invalid invoice payload format through bot runtime.

## Notes

- DuckDNS token was not found locally, so production is cut over through sslip.io HTTPS. DuckDNS can be repointed later without app downtime if token is recovered.
- Old prod VM coder-survival-app-clean / 89.169.140.107 is still running as rollback hold.
- Staging VM cs-staging-vm / 89.169.140.219 is still running.
- Local secret copy is outside the repo at C:\\Users\\Имярек\\.yc-secrets\\coder-survival-prod-runtime-env.raw.

## DuckDNS restoration

- DuckDNS hostname coder-survival-api.duckdns.org was repointed to 111.88.243.88.
- Caddy now serves TLS for coder-survival-api.duckdns.org and 111-88-243-88.sslip.io.
- Frontend and bot production deployments were returned to https://coder-survival-api.duckdns.org.
- Verification after DuckDNS restoration: direct health 200, frontend health 200, direct/frontend state 200, direct/frontend meme 200 image/png 2006 bytes, bot API_URL check reached backend.

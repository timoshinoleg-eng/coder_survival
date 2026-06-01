# Yandex Cloud Migration Implementation Report

Date: 2026-05-31 03:00 Europe/Moscow

## Implemented

- Verified current production API DNS already resolves to Yandex Cloud VM `coder-survival-app-clean` at `89.169.140.107`.
- Created service account `cs-prod-sa` (`ajehgv56o5g3rdgo04pd`).
- Granted `cs-prod-sa` runtime roles:
  - `container-registry.images.puller` on `coder-survival-registry`
  - `lockbox.payloadViewer`
  - `logging.writer`
  - `monitoring.editor`
  - `storage.uploader`
  - `storage.viewer`
- Created Lockbox secret `cs-prod-secrets` with keys:
  - `DB_PASSWORD`
  - `BOT_BACKEND_SECRET`
  - `JWT_SECRET`
- Created Object Storage buckets:
  - `coder-survival-media-staging`, private, 1 GiB cap
  - `coder-survival-media-prod`, private, 5 GiB cap
- Created S3-compatible static access key for `cs-prod-sa`.
  - Secret material was written outside the repo to `%USERPROFILE%\.yc-secrets\cs-prod-sa-s3-access-key.json`.
- Created security group `cs-staging-sg` with inbound `22`, `80`, `443` and outbound any.
- Created staging VM `cs-staging-vm`:
  - external IP `89.169.140.219`
  - 2 vCPU, 4 GiB RAM, 50 GiB network SSD
  - Ubuntu 22.04
  - service account `cs-prod-sa`
- Installed Docker and Docker Compose on staging VM.
- Built backend Docker image on staging VM.
- Ran staging stack with Dockerized PostgreSQL 16.
- Applied backend migrations `001` through `043` successfully.
- Pushed backend image to Container Registry:
  - `cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest`
  - digest `sha256:d920cec9c43f996a6e6bd11dd74f717a50cfc5c4b2c939b7894f85d554038326`
- Removed temporary `container-registry.images.pusher` role after push.

## Verification

- Production API health:
  - `https://coder-survival-api.duckdns.org/health` -> `200`, remote IP `89.169.140.107`
- Vercel health:
  - `https://frontend-ashy-alpha-77.vercel.app/health` -> `200`
- Staging health:
  - `http://89.169.140.219/health` -> `200`
- Staging smoke:
  - Core smoke mostly passed: health, state, tap, daily quests, battle, event active, pass, referral, shop, internal observation, team, payment confirm, leaderboard.
  - Known script/environment mismatches:
    - `buy/invoice-link` fails because `scripts/smoke-prod.ps1` hardcodes production bot invoice-link URL while staging uses an isolated DB.
    - `event/claim` smoke expects `rewardApplied.applied`, while backend returns `rewardApplied` as a boolean.
- Native media checks:
  - `api/meme?templateId=wtf_per_minute&format=1:1` produced PNG, 2006 bytes.
  - `api/meme/gif/debug-stages` produced GIF, 9803 bytes.
  - `api/meme/gif/deadline` produced GIF, 4009 bytes.

## Not Cut Over

Production cutover to the new staging VM was intentionally not performed because:

- staging DB is empty and not restored from production;
- staging endpoint has no TLS/domain attached;
- current production API already runs on Yandex Cloud behind DuckDNS;
- SSH access to the current production VM `coder-survival-app-clean` still rejects the expected metadata key, so production backup/rollback commands cannot be verified from this machine;
- Vercel CLI is available through `npx`, but production env changes were not made because there is no safe target to switch to.

## Required Before Any Production Switch

1. Restore or fix SSH access to `coder-survival-app-clean`.
2. Take verified production DB backup.
3. Restore the backup into the target DB if switching compute.
4. Attach HTTPS/domain to target backend.
5. Fix or parameterize `scripts/smoke-prod.ps1` for staging invoice-link and `event/claim` response shape.
6. Run full smoke against the exact target domain.
7. Only then update Vercel `API_ORIGIN` or DNS.

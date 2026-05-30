# Domain Hardening Plan

## Goal

Убрать временный upstream `https://111-88-247-195.sslip.io` из production topology и перевести публичный контур на постоянный домен без поломки:

- Telegram Mini App launch URL
- public `/api/*`
- public `/health`
- bot webhook runtime

## Current reality

- frontend alias:
  - `https://frontend-ashy-alpha-77.vercel.app`
- bot webhook alias:
  - `https://coder-survival-bot.vercel.app/api/webhook`
- temporary backend upstream:
  - `https://111-88-247-195.sslip.io`
- Vercel frontend сейчас rewrites `/api/*` и `/health` на `sslip.io`

## Recommended target shape

Use explicit domains instead of Vercel defaults:

- app:
  - `https://app.<your-domain>`
- bot webhook:
  - `https://bot.<your-domain>/api/webhook`
- backend upstream:
  - `https://api.<your-domain>`

If you want the simplest operator path, use:

- `app.codersurvival.ru`
- `bot.codersurvival.ru`
- `api.codersurvival.ru`

## Pre-cutover checklist

1. DNS:
   - create `app.<domain>`
   - create `bot.<domain>`
   - create `api.<domain>`
2. TLS:
   - Vercel-managed TLS for `app` and `bot`
   - host nginx/certbot or LB-managed TLS for `api`
3. VM ingress:
   - ensure `api.<domain>` terminates TLS and proxies to backend
4. Secrets/config:
   - Vercel bot project `WEBAPP_URL` -> `https://app.<domain>`
   - VM/backend `.env` `WEBAPP_URL` -> `https://app.<domain>`
   - if BotFather menu button is set, prepare the final `https://app.<domain>`
5. Bot webhook:
   - confirm `TELEGRAM_WEBHOOK_SECRET` is present in Vercel bot runtime

## Required config changes

### 1. Frontend Vercel rewrites

Current:

- `/api/*` -> `https://111-88-247-195.sslip.io/api/*`
- `/health` -> `https://111-88-247-195.sslip.io/health`

Cutover target:

- `/api/*` -> `https://api.<domain>/api/*`
- `/health` -> `https://api.<domain>/health`

File:

- [frontend/vercel.json](C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new\frontend\vercel.json)

### 2. Bot WebApp URL

Ensure `WEBAPP_URL` points to:

- `https://app.<domain>`

Relevant files/runtime:

- [bot/src/createBot.js](C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new\bot\src\createBot.js)
- Vercel bot env vars
- VM `.env`

### 3. BotFather

Update:

- menu button / WebApp URL -> `https://app.<domain>`
- if webhook path/domain changes, confirm Telegram webhook still points to `https://bot.<domain>/api/webhook`

### 4. VM nginx / TLS

Current repo nginx config is generic container proxy only.

Operational requirement outside repo:

- public `api.<domain>` must terminate TLS
- then proxy to backend runtime
- preserve:
  - `Host`
  - `X-Forwarded-For`
  - `X-Forwarded-Proto`

Reference file:

- [nginx/codersurvival.conf](C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new\nginx\codersurvival.conf)

## Safe cutover order

1. Provision DNS records.
2. Attach `app.<domain>` to Vercel frontend project.
3. Attach `bot.<domain>` to Vercel bot project.
4. Provision TLS + reverse proxy for `api.<domain>`.
5. Update [frontend/vercel.json](C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new\frontend\vercel.json) rewrites from `sslip.io` to `api.<domain>`.
6. Redeploy frontend on Vercel.
7. Update bot `WEBAPP_URL` to `https://app.<domain>`.
8. Redeploy bot on Vercel.
9. Update BotFather menu button / WebApp URL.
10. Run post-cutover validation:
    - `pwsh -File scripts/domain-cutover-check.ps1 -AppBaseUrl https://app.<domain> -BotWebhookUrl https://bot.<domain>/api/webhook -ExpectedApiHost api.<domain>`
11. Only after green validation, remove `sslip.io` references from docs/status.

## Rollback plan

If cutover fails:

1. revert frontend Vercel rewrites back to `sslip.io`
2. redeploy frontend
3. revert bot `WEBAPP_URL` to known-good app alias
4. redeploy bot
5. restore BotFather menu button if needed

## Definition of done

- app opens from final public domain
- public `/api/state` works through final app domain
- public `/health` works through final app domain
- bot webhook answers on final bot domain
- BotFather points to final app domain
- no production dependency remains on `sslip.io`

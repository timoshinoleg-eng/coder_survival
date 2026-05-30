# DuckDNS API Plan

## Goal

Стабилизировать backend upstream без покупки домена:

- оставить `app` на текущем `vercel.app`
- оставить `bot` на текущем `vercel.app`
- заменить только `sslip.io` на управляемый бесплатный DDNS hostname

Recommended shape:

- app:
  - `https://frontend-ashy-alpha-77.vercel.app`
- bot:
  - `https://coder-survival-bot.vercel.app/api/webhook`
- api:
  - `https://coder-survival-api.duckdns.org`

## Selected default candidate

Chosen default hostname:
- `coder-survival-api.duckdns.org`

Audit note:
- on `2026-05-07`, DNS lookup for `coder-survival-api.duckdns.org` did not resolve from the current environment
- that strongly suggests the hostname is still free, but DuckDNS registration is still required before cutover

## Why this path

- не требует покупки домена
- убирает production dependency от IP-encoded hostname
- не требует менять публичный app URL и bot URL прямо сейчас
- минимальный blast radius: меняется только upstream для Vercel rewrites

## What you need

1. DuckDNS account
2. one subdomain:
   - `coder-survival-api`
3. DuckDNS token
4. public VM IP still pointing at `111.88.247.195`

## Target DNS/TLS topology

- DuckDNS hostname resolves to VM public IP
- TLS terminates on VM host nginx / certbot
- nginx proxies:
  - `/api/*` -> backend
  - `/health` -> backend
- Vercel frontend rewrites:
  - `/api/*` -> `https://coder-survival-api.duckdns.org/api/*`
  - `/health` -> `https://coder-survival-api.duckdns.org/health`

## Safe cutover order

1. Register the DuckDNS subdomain.
2. Point it to `111.88.247.195`.
3. Provision HTTPS for the DuckDNS hostname on VM.
4. Verify directly:
   - `https://coder-survival-api.duckdns.org/health`
   - `https://coder-survival-api.duckdns.org/api/state` with signed initData smoke
5. Switch Vercel frontend rewrites to DuckDNS:
   - use `scripts/set-api-origin.ps1 -ApiOrigin https://coder-survival-api.duckdns.org`
6. Redeploy frontend:
   - `npx vercel deploy --prod --yes`
7. Run full public smoke:
   - `pwsh -File scripts/smoke-prod.ps1`

Optional helper for the DNS update call itself:
- `pwsh -File scripts/duckdns-update.ps1 -Token <duckdns-token>`

VM-side HTTPS/proxy setup helper:
- `pwsh -File scripts/setup-api-host-on-vm.ps1 -ApiHost coder-survival-api.duckdns.org`

## VM-side requirement

Your VM must terminate HTTPS for the DuckDNS hostname.

Repository note:
- repo nginx config is container-internal only
- host-level TLS/proxy config still lives outside repo

Relevant repo file:
- [nginx/codersurvival.conf](C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new\nginx\codersurvival.conf)

## Frontend rewrite switch

Use:

```powershell
pwsh -File scripts/set-api-origin.ps1 -ApiOrigin https://coder-survival-api.duckdns.org
```

This only updates:
- [frontend/vercel.json](C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_repo_new\frontend\vercel.json)

It does not deploy by itself.

## Rollback

If DuckDNS cutover fails:

1. run:

```powershell
pwsh -File scripts/set-api-origin.ps1 -ApiOrigin https://111-88-247-195.sslip.io
```

2. redeploy frontend:

```powershell
cd frontend
npx vercel deploy --prod --yes
```

## Definition of done

- `sslip.io` is no longer used by frontend rewrites
- `https://coder-survival-api.duckdns.org/health` is green
- public `https://frontend-ashy-alpha-77.vercel.app/api/state` stays green
- bot runtime remains unchanged and healthy

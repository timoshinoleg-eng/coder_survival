# Coder Survival — Current Architecture

**Date:** 2026-07-24 · **Status:** canonical (supersedes topology claims in
`DEPLOY.md`, `HANDOFF.md`, `AGENT_HANDOFF.md`, `YANDEX_CLOUD_MIGRATION_PLAN.md`,
`RENDER_SETUP.md`, `project-status.json`).

> ⚠️ **Topology has documented drift** (three different VM IPs across the repo).
> The diagram below is the *most-likely* current production shape inferred from
> the newest sources; values marked **(CONFIRM)** must be verified by the owner
> before any deploy.

## Components

- **Frontend** (Preact 10 + Phaser 3.60 + Vite): static build hosted on
  **Vercel**. Loaded inside the Telegram Mini App WebView. `vercel.json`
  rewrites `/api/*` to the backend via the DuckDNS hostname.
- **Bot webhook** (Grammy, serverless): **Vercel** function
  (`bot/api/webhook.js`, `bot/api/invoice-link.js`). Verifies Telegram’s
  `X-Telegram-Bot-Api-Secret-Token` (now fail-closed).
- **Backend API** (Node 20 + Express): **Docker container on a Yandex Cloud VM**,
  port 3000, behind a reverse proxy (Caddy/nginx) terminating TLS. Health at
  `/health`.
- **Database:** PostgreSQL 15 (managed/YC). Migrations via `backend/src/migrate.js`
  (`schema_migrations`, filename-keyed, transactional).
- **Payments:** Telegram Stars (`XTR`). Invoice created via bot; confirmation via
  bot `successful_payment` → backend `internal/payments` (secured with
  `BOT_BACKEND_SECRET`).
- **Cron/jobs:** `node-cron` inside the backend process (season rotation, daily
  battle, hackathon, achievements, random events, flash sales, daily summary,
  health alert).
- **Container registry:** `cr.yandex/crpduv7gci2puq300f38` **(CONFIRM — the
  current `deploy-backend.yml` builds on-VM and does not push here).**

## Diagram

```mermaid
flowchart TD
  user["Telegram user"] -->|opens Mini App| tg["Telegram client (iOS/Android WebView)"]
  tg -->|loads static SPA| fe["Frontend (Vercel)"]
  tg -->|bot messages / Stars| botapi["Telegram Bot API"]

  fe -->|"/api/* (initData in X-Telegram-Init-Data)"| proxy["Reverse proxy + TLS (Caddy/nginx on VM)"]
  botapi -->|webhook + secret token| botfn["Bot webhook (Vercel serverless)"]

  proxy --> be["Backend API (Docker on Yandex Cloud VM)"]
  botfn -->|create invoice| botapi
  botfn -->|"successful_payment (X-Bot-Backend-Secret)"| be

  be --> pg[("PostgreSQL 15")]
  be -->|node-cron jobs| be

  subgraph dns["DNS (CONFIRM)"]
    duck["coder-survival-api.duckdns.org → VM IP"]
  end
  proxy -.-> duck

  classDef confirm stroke-dasharray: 4 3;
  class dns confirm;
```

## Data / payment flow (happy path)

1. User opens Mini App → SPA boots, reads `window.Telegram.WebApp.initData`.
2. SPA calls `/api/state` etc. with `X-Telegram-Init-Data`; backend verifies
   HMAC/Ed25519 + `auth_date` age, then serves server-authoritative state.
3. Purchase: SPA → `/api/buy` (or `/api/shop/purchase-deal`) → backend creates a
   `pending` purchase + returns a Stars payload → bot `invoice-link` →
   `tg.openInvoice`.
4. On payment, Telegram calls the bot webhook (`successful_payment`); the bot
   calls backend `internal/payments` (with `BOT_BACKEND_SECRET`) which credits
   the reward idempotently; the SPA reloads state to reflect it.

## Topology drift table (resolve before deploy)

| Value | Where it appears | Assessment |
|-------|------------------|------------|
| `111.88.243.88` (`yc-user@`) | `HANDOFF.md` (newest) | **Most likely current prod VM (CONFIRM).** |
| `111.88.247.195` | `DEPLOY.md`, `project-status.json`, `manual-release.yml` (hardcoded in `ssh-keyscan`) | Old VM, decommissioned ~May 2026 — **legacy.** |
| `185.92.221.219` (`root@`) | `scripts/*.ps1` default `$VmHost` | Stale default — **do not trust.** |
| `89.169.140.219` | `integration-tests-staging.yml` (plaintext) | Staging DB/host — move to a secret. |
| Render.com (`coder-survival.onrender.com`) | `render.yaml`, `render-*.yml`, `RENDER_SETUP.md` | **Abandoned platform** — archive; not production. |
| `coder-survival-api.duckdns.org` | `frontend/vercel.json` | Current API hostname → VM (CONFIRM DNS target). |
| `cr.yandex/crpduv7gci2puq300f38` | `backend/package.json` docker scripts | Registry not used by current deploy path — **CONFIRM.** |

## Deploy path (current, manual, human-gated)

`deploy-backend.yml` (`workflow_dispatch` only): run tests → `rsync` backend to
the VM → `docker build` on VM → restart container with secrets → `/health`
retry → verify. There is **no auto-deploy on push** and no zero-downtime
guarantee (single container restart = brief unavailability window; rollback =
redeploy previous image/commit). See `DEPLOY.md` for the operator runbook.

**Recommended CI set:** keep `backend-tests.yml` (real gate, now with a
migration bootstrap gate) and `security-scan.yml` (CodeQL + TruffleHog + npm
audit). Archive `render-health.yml` / `render-setup.yml` (dead platform). Fix or
retire `manual-release.yml` (references a non-existent `pwsh` action + the legacy
VM IP). `claude-agent.yml` auto-triggers are disabled.

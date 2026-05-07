# Coder Survival — Telegram Mini App

Игра-кликер "Выживание программиста" для Telegram Mini Apps.

## Текущий статус

- MVP рабочий: `/start` отвечает, Mini App открывается, тапы сохраняются, энергия/коммиты/депрессия обновляются, leaderboard работает.
- Backend и база работают на VM `111.88.247.195`.
- Публичный фронтенд Mini App сейчас отдается с Vercel:
  - `https://frontend-ashy-alpha-77.vercel.app`
- Публичный API для клиента и бота теперь идет через Vercel frontend domain:
  - `https://frontend-ashy-alpha-77.vercel.app/api/*`
- Backend upstream теперь стабилизирован на DuckDNS:
  - `https://coder-survival-api.duckdns.org`
- Публичный bot runtime сейчас работает через Vercel webhook:
  - `https://coder-survival-bot.vercel.app/api/webhook`

## Текущая схема

```text
Telegram client
  -> Telegram webhook
  -> https://coder-survival-bot.vercel.app/api/webhook
  -> WebApp URL: https://frontend-ashy-alpha-77.vercel.app
  -> API base: https://frontend-ashy-alpha-77.vercel.app/api
  -> backend + PostgreSQL on VM 111.88.247.195
```

## Структура проекта

```text
├── frontend/            # Preact 10 + Phaser 3.60 (Mini App UI)
├── backend/             # Node.js 20 + Express + PostgreSQL (API)
├── bot/                 # Grammy bot (Vercel webhook runtime; local polling guarded)
├── nginx/               # Reverse proxy config for container runtime
├── observation/         # SELECT-only SQL snippets for manual economy observation
├── payments/            # Telegram Stars integration docs (legacy payment mocks removed)
├── analytics/           # Amplitude events
├── calculator/          # Revenue model
├── project-status.json  # Машинно-читаемый статус проекта
└── BOT_RUNTIME_PLAN.md  # План перевода бота в постоянный runtime
```

## Быстрый старт

### Фронтенд

```bash
cd frontend
npm ci
npm run build
```

### Бэкенд

```bash
cd backend
npm ci
npm run migrate
npm run start
```

### Bot

```bash
cd bot
npm ci
npm run start
```

## Release Ops

Production release path:

```powershell
pwsh -File scripts/release-prod.ps1
```

Release preflight:

```powershell
pwsh -File scripts/release-preflight.ps1
```

Standalone production smoke:

```powershell
pwsh -File scripts/smoke-prod.ps1
```

Economy observation snapshot:

```powershell
pwsh -File scripts/observe-economy.ps1
```

Post-cutover domain validation:

```powershell
pwsh -File scripts/domain-cutover-check.ps1 `
  -AppBaseUrl https://app.<domain> `
  -BotWebhookUrl https://bot.<domain>/api/webhook `
  -ExpectedApiHost api.<domain>
```

Notes:
- `release-prod.ps1` can redeploy `frontend` and `bot` on Vercel, sync backend source to VM, rebuild backend with `--no-cache`, run migrations, force-recreate backend, and then run smoke.
- `release-preflight.ps1` checks git cleanliness, forbidden secret files, compose syntax, package lock alignment, migration continuity, and optional frontend build before release.
- `smoke-prod.ps1` generates signed Telegram `initData` using the production `BOT_TOKEN` from the VM runtime and checks the public Vercel/API path end to end.
- `observe-economy.ps1` fetches the backend observation secret from the VM runtime and prints the protected aggregate economy report.
- `.github/workflows/manual-release.yml` is a draft `workflow_dispatch` wrapper around `release-prod.ps1`; keep it draft until a self-hosted runner or stable SSH path is available.
- `scripts/release-manual-checklist.md` is the operator checklist companion to the hardened PowerShell release path.
- `domain-cutover-check.ps1` is the post-DNS/post-TLS validation script for the final permanent domain.
- `set-api-origin.ps1` switches the frontend Vercel rewrite upstream, including a DuckDNS-based API hostname if you choose the no-purchase path.
- `duckdns-update.ps1` performs the DuckDNS API update call for the selected no-purchase hostname `coder-survival-api.duckdns.org`.
- `setup-api-host-on-vm.ps1` provisions the host-level nginx site and `certbot` certificate for that API hostname on the VM.

Manual SQL observation pack:
- `observation/README.md` documents 7 `SELECT`-only snippets for DAU/retention, quests, offers, weekly hackathon, sprint pass, shop funnel and one-shot economy health.

## Инфраструктура

| Компонент | Статус | Детали |
|-----------|--------|--------|
| VM | ✅ Running | `111.88.247.195` |
| PostgreSQL | ✅ Running | Yandex Managed PostgreSQL |
| Frontend URL | ✅ Working | `https://frontend-ashy-alpha-77.vercel.app` |
| Public API URL | ✅ Working | `https://frontend-ashy-alpha-77.vercel.app/api` |
| Upstream backend URL | ✅ Working | `https://coder-survival-api.duckdns.org` |
| Telegram `/start` | ✅ Working | Через Vercel webhook runtime |
| Bot runtime | ✅ Working | `https://coder-survival-bot.vercel.app/api/webhook` |
| Bot runtime on VM | ⚠️ Disabled | VM не достукивается до `api.telegram.org` |

## Что осталось довести

1. Доротация оставшихся чувствительных секретов перед публичным масштабированием.
2. Развить платежный контур от базового fulfillment до полноценной витрины/выдачи товаров в UI.
3. При желании перейти с DuckDNS на собственный primary domain.
4. При желании вернуть bot runtime на VM после исправления egress к `api.telegram.org`.

## Документация

### Для игроков / операторов поддержки
- [GAME_RULES.md](GAME_RULES.md) — актуальные правила игры, механики баланса и глоссарий статусов
- [support/GAMEPLAY_FAQ.md](support/GAMEPLAY_FAQ.md) — операционный FAQ для саппорта (triage expected behavior vs bug)

### Для команды / разработки
- [HANDOFF.md](HANDOFF.md)
- [DEPLOY.md](DEPLOY.md)
- [LAUNCH_NEXT_STEPS.md](LAUNCH_NEXT_STEPS.md)
- [BOT_RUNTIME_PLAN.md](BOT_RUNTIME_PLAN.md)
- [observation/README.md](observation/README.md)
- [observation/OPERATOR_CHEATSHEET.md](observation/OPERATOR_CHEATSHEET.md)
- [scripts/release-manual-checklist.md](scripts/release-manual-checklist.md)
- [SMOKE_COVERAGE.md](SMOKE_COVERAGE.md) — live smoke test inventory and coverage gaps
- [SUPPORT_KNOWN_ISSUES.md](SUPPORT_KNOWN_ISSUES.md)

## Лицензия

MIT

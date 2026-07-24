# Coder Survival — текущее состояние деплоя

> ⚠️ **Каноничный источник топологии — `docs/CURRENT_ARCHITECTURE.md`.**
> Этот файл — операторский runbook. VM-адрес `111.88.247.195` ниже —
> **устаревший** (старая VM). Актуальный prod-VM/DNS — в drift-таблице
> `docs/CURRENT_ARCHITECTURE.md`; подтверди у владельца перед деплоем.

## Что сейчас реально работает

- Backend и PostgreSQL работают на VM `111.88.247.195`.
- Frontend Mini App вынесен на Vercel:
  - `https://frontend-ashy-alpha-77.vercel.app`
- Клиентский и bot-facing API опубликован через frontend domain:
  - `https://frontend-ashy-alpha-77.vercel.app/api/*`
- VM upstream backend:
  - `https://coder-survival-api.duckdns.org`
- Bot runtime вынесен на Vercel webhook:
  - `https://coder-survival-bot.vercel.app/api/webhook`
- Telegram flow живой:
  - `/start` отвечает
  - Mini App открывается
  - taп-сценарий работает
  - leaderboard открывается

## Последний релиз

- Дата: `2026-05-07`
- Что сделано:
  - backend source на VM синхронизирован с текущим repo
  - backend пересобран и принудительно recreated
  - frontend redeployed to Vercel production alias
  - bot redeployed to Vercel production alias
  - DuckDNS hostname `coder-survival-api.duckdns.org` добавлен и направлен на VM
  - host nginx + certbot настроены для `coder-survival-api.duckdns.org`
  - frontend Vercel rewrites переключены на DuckDNS upstream
  - на production PostgreSQL применены:
    - `003_referral_milestones.sql`
    - `004_stage4_retention.sql`
    - `005_offer_cooldowns.sql`
    - `006_balance_tuning.sql`
    - `007_minimum_economy_instrumentation.sql`
    - `008_remove_progression_trigger.sql` (prepared in repo; apply on next release)
  - production smoke через публичный `https://frontend-ashy-alpha-77.vercel.app/api/*` прошел для:
    - `health`
    - `state`
    - `tap`
    - `quests`
    - `battle`
    - `event`
    - `pass`
    - `referral`
    - `shop`
    - `team`

## Текущая временная схема

Причина текущей topology:
- VM не имеет стабильного исходящего доступа к `https://api.telegram.org`
- поэтому bot runtime вынесен из VM и работает через Telegram webhook на Vercel

Что используется сейчас:
- bot runtime развернут как отдельный Vercel project
- Telegram получает updates через webhook
- WebApp URL для запуска: `https://frontend-ashy-alpha-77.vercel.app`
- API URL для фронтенда и бота: `https://frontend-ashy-alpha-77.vercel.app`
- Vercel frontend проксирует `/api/*` и `/health` на VM upstream

## Что развернуто на VM

- путь на VM: `/opt/coder-survival/app`
- Docker Compose backend-only стек через `docker-compose.backend.yml`
- host nginx + certbot для HTTPS на `coder-survival-api.duckdns.org`

Примечание:
- контейнерный `bot` на VM сейчас не является основным рабочим runtime
- production-бот обслуживается Vercel webhook runtime

## Операционная правда

### Рабочие публичные адреса

- Frontend:
  - `https://frontend-ashy-alpha-77.vercel.app`
- Public API:
  - `https://frontend-ashy-alpha-77.vercel.app/api/*`
- Bot webhook:
  - `https://coder-survival-bot.vercel.app/api/webhook`
- Backend health:
  - `https://frontend-ashy-alpha-77.vercel.app/health`
- Backend API:
  - `https://coder-survival-api.duckdns.org/api/*` (upstream only)

### Проверенный пользовательский сценарий

Минимальный живой smoke уже прошел:
- `/start`
- открытие WebApp
- получение state
- tap loop
- leaderboard
- Stage 4 API paths (`event`, `pass`, `team`)
- bot webhook public function responds on production alias

## Следующий обязательный шаг

Главный remaining risk сейчас не в коде, а в runtime split:
- bot runtime стабилизирован вне VM, но VM-сетевой дефект остаётся неустраненным

Детальный план:
- [BOT_RUNTIME_PLAN.md](BOT_RUNTIME_PLAN.md)

## Bot runtime env requirements

- `bot/src/createBot.js` and `bot/api/invoice-link.js` now fail-fast if `API_URL` is not set.  
  Do not rely on implicit `http://localhost:3000` or hardcoded frontend URLs in production.

## Следующий этап

1. При желании заменить DuckDNS на собственный primary domain.
2. Убедиться, что BotFather menu button указывает на финальный URL.
3. Ротировать `BOT_TOKEN` и пароль PostgreSQL, если они использовались вне нормального секретного контура.
4. Опционально вернуть bot runtime на VM после исправления egress к Telegram API.

## Полезные команды на VM

```bash
ssh ubuntu@111.88.247.195
cd /opt/coder-survival/app
docker-compose -f docker-compose.backend.yml ps
docker-compose -f docker-compose.backend.yml logs --tail=100 backend
# legacy frontend/bot containers (if any) from docker-compose.prod.yml:
# docker-compose -f docker-compose.prod.yml logs --tail=100 frontend
# docker-compose -f docker-compose.prod.yml logs --tail=100 bot
docker build --no-cache -t cr.yandex/crpduv7gci2puq300f38/coder-survival-backend:latest ./backend
docker-compose -f docker-compose.backend.yml run --rm backend node src/migrate.js
docker-compose -f docker-compose.backend.yml up -d --force-recreate backend
curl -I https://coder-survival-api.duckdns.org/health
```

## Основной release path

```powershell
pwsh -File scripts/release-prod.ps1
```

Preflight before release:

```powershell
pwsh -File scripts/release-preflight.ps1
```

Что делает:
- Vercel production deploy для `frontend` и `bot`
- sync backend source на VM
- `docker build --no-cache -t cr.yandex/.../coder-survival-backend:latest ./backend`
- `docker-compose ... run --rm backend node src/migrate.js`
- `docker-compose ... up -d --force-recreate backend`
- production smoke через публичные URL
- observation smoke через `GET /api/internal/observation/economy`
- targeted offer smoke через `scripts/smoke-offers.ps1`

Отдельный smoke:

```powershell
pwsh -File scripts/smoke-prod.ps1
```

Economy observation snapshot:

```powershell
pwsh -File scripts/observe-economy.ps1
```

Manual SQL deep-dive:

- `observation/README.md` — documents the two-path model (operator API vs manual SQL) and parity mapping
- `observation/OPERATOR_CHEATSHEET.md` — quick-reference thresholds and safety rules
- `observation/01_dau_retention.sql`
- `observation/02_daily_quests.sql`
- `observation/03_context_offers.sql`
- `observation/04_weekly_hackathon.sql`
- `observation/05_sprint_pass.sql`
- `observation/06_shop_purchases.sql`
- `observation/07_economy_health.sql`

Targeted context-offer smoke:

```powershell
pwsh -File scripts/smoke-offers.ps1
```

Post-cutover validation for the final domain:

```powershell
pwsh -File scripts/domain-cutover-check.ps1 `
  -AppBaseUrl https://app.<domain> `
  -BotWebhookUrl https://bot.<domain>/api/webhook `
  -ExpectedApiHost api.<domain>
```

DDNS-only API switch without buying a domain:

```powershell
pwsh -File scripts/duckdns-update.ps1 -Token <duckdns-token>
pwsh -File scripts/setup-api-host-on-vm.ps1 -ApiHost coder-survival-api.duckdns.org
pwsh -File scripts/set-api-origin.ps1 -ApiOrigin https://coder-survival-api.duckdns.org
cd frontend
npx vercel deploy --prod --yes
pwsh -File scripts/smoke-prod.ps1
```

## Локальные проверки репозитория

```bash
npm --prefix frontend ci
npm --prefix frontend run build
npx vercel deploy --prod --yes
docker compose -f docker-compose.backend.yml config
node --check bot/index.js
```

## Операционные замечания

- `coder-survival-api.duckdns.org` сейчас является рабочим upstream HTTPS-адресом между Vercel и VM.
- Vercel используется как текущий production frontend для Telegram Mini App и как runtime для webhook-бота.
- Старую VM `111.88.254.2` считать legacy.
- Не хранить реальные секреты в репозитории.
- Для backend-релиза здесь нужен именно direct `docker build ./backend` + `--force-recreate`; обычный `up -d backend` может оставить контейнер на старом `latest` image.
- `docker-compose build --no-cache backend` тоже один раз дал stale-image mismatch на релизе `2026-05-07`, поэтому рабочий runbook переведен на прямой `docker build`.
- Vercel auth в текущей среде подтверждён; `npx vercel whoami` возвращает рабочий аккаунт.
- `scripts/deploy.sh` оставлен только как guard и больше не является рабочим release-script.
- `.github/workflows/manual-release.yml` существует только как draft wrapper around `scripts/release-prod.ps1`; не считать его production truth, пока не будет отдельной валидации runner/SSH path.
- `scripts/release-manual-checklist.md` is the operator-facing checklist that should stay aligned with `scripts/release-prod.ps1`.
- domain cutover checklist lives in `DOMAIN_HARDENING_PLAN.md`.
- DuckDNS-based API cutover checklist lives in `DUCKDNS_API_PLAN.md`.
- default no-purchase DuckDNS candidate is `coder-survival-api.duckdns.org`.

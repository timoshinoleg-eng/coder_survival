# Handoff: Coder Survival

> ⚠️ **Устаревший статус-документ.** Каноничное текущее состояние:
> `docs/PRODUCTION_READINESS_REPORT.md` и `docs/CURRENT_ARCHITECTURE.md`.

## Workspace
- Active repo: `C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_fresh`
- Branch: `main`
- Remote: `origin https://github.com/timoshinoleg-eng/coder_survival.git`
- Current pushed HEAD: `c3801e7 test: align backend integration contracts`
- Local branch `main` is **ahead of `origin/main` by 5 commits** — these fixes are committed locally and **awaiting push / deploy**.
- Release tag pushed: `prod-pp18-yc-2026-06-01`
- Current expected dirty worktree: docs/support updates (this file, `support/*.md`, `project-status.json`).

## Production Status
PP-18 Prestige and the Yandex Cloud backend migration are live in production.

- Production API: `https://coder-survival-api.duckdns.org`
- Vercel frontend: `https://frontend-ashy-alpha-77.vercel.app`
- Bot webhook endpoint: `https://coder-survival-bot.vercel.app/api/webhook`
- YC VM: `yc-user@111.88.243.88`
- App dir on VM: `/opt/coder-survival/app`
- Backend container: `coder-survival-backend`
- Backend image digest:
  - `cr.yandex/crpduv7gci2puq300f38/coder-survival-backend@sha256:9b696298196704a91dffb11ab7c2e1c4e3c30d1b99eb5d2fce9862c7198dcae0`

## What Was Completed
- Added migration `backend/migrations/045_add_social_state.sql`.
  - `progression.social_state JSONB NOT NULL DEFAULT '{}'`
  - Applied to production DB.
  - Recorded in `schema_migrations`.
- Fixed production random event SQL placeholder bug in `backend/src/utils/randomEventEngine.js`.
- Accepted and committed the external test/code alignment fixes:
  - UTC login reward date normalization.
  - passive depression decay and event state persistence fixes.
  - `depression_level` response numeric normalization.
  - random event state handoff cleanup.
  - DB test reset deadlock fix.
  - stale integration test contracts updated.
- Built/patched/restarted YC backend container and pushed current image to YC Container Registry.
- Created and pushed release tag `prod-pp18-yc-2026-06-01`.

## Pending Release — 5 Local Commits Awaiting Push/Deploy

The following commits are on `main` but **not yet pushed** to `origin/main`.
They should go out together as a low-risk docs + backend hardening patch.

| Commit | Message | Scope | Risk |
|--------|---------|-------|------|
| `ba60665` | fix: normalize login reward dates | `backend/src/utils/date.js`, `loginReward.js` + tests | Low — guards UTC boundary for daily login rewards |
| `1dac8e8` | fix: keep legacy random events active until refactor taps | `backend/src/utils/randomEventEngine.js` + tests | Low — preserves legacy random-event lifecycle until tap refactor lands |
| `f9e86c4` | refactor: centralize idle progression persistence | `backend/src/utils/progression.js` + tests | Low — consolidates passive stress/energy decay into one code path |
| `db69639` | test: reset database without sleep | `backend/tests/helpers/testDb.js` | Low — removes `sleep` from test teardown, speeds up suite |
| `e2393fa` | fix: render illustrated meme cards | `backend/src/utils/memeRenderer.js` + tests | Low — restores illustrated meme scene rendering instead of blank cards |

### Release readiness for these 5 commits
- Full backend suite was run locally before the last commit:
  - `npm --prefix backend test -- --runInBand`
  - Result: `28/28` suites passed, `295/295` tests passed (baseline from `c3801e7`).
- These 5 commits touch only `backend/src/utils/*` and `backend/tests/*` — no frontend or infra changes.
- **Next step:** push `main` to `origin/main`, then run `scripts/release-prod.ps1` or manual YC deploy if backend image rebuild is required.

## Verification Evidence
- Local full backend suite:
  - `npm --prefix backend test -- --runInBand`
  - Result: `28/28` suites passed, `295/295` tests passed.
- GitHub Actions:
  - Run: `26755938753`
  - URL: `https://github.com/timoshinoleg-eng/coder_survival/actions/runs/26755938753`
  - Job: `Backend Tests`
  - Conclusion: `success`
  - Head SHA: `c3801e787cc8d20312d5a54f94053ec5ce52f9b5`
- Production health:
  - `https://coder-survival-api.duckdns.org/health` returns `status=ok`, `db=connected`.
  - `https://frontend-ashy-alpha-77.vercel.app/health` returns `status=ok`, `db=connected` through Vercel rewrite.
- YC container:
  - container status: `healthy`
  - environment: `production`
  - latest checked logs show startup, cron scheduling, and no app errors.
- Production PP-18 smoke with test Telegram ID `918000002`:
  - state create OK
  - prestige preview locked before eligibility OK
  - seeded eligibility OK
  - eligible preview returned `31 PP`
  - prestige execute OK: `prestige.level=1`, `currency=31`
  - state after prestige OK: `level.maxEnergy=110`
  - tap after prestige OK
  - prestige shop OK, 5 items
- Broad production smoke with test Telegram IDs `900000123` / `900000124`:
  - frontend health OK
  - API health OK
  - state OK
  - tap OK
  - daily quests OK
  - random event active OK
  - pass status OK
  - referral stats OK
  - shop products OK
  - buy intent contract OK
  - valid achievement PNG OK
  - authenticated GIF endpoints OK
  - meme token auth secret OK
  - internal economy OK
  - payment confirm idempotency OK
  - bot webhook GET returns `401`, which is acceptable for protected endpoint and confirms non-5xx reachability.
- Browser frontend check:
  - Direct browser opened `https://frontend-ashy-alpha-77.vercel.app`.
  - Title: `Coder Survival`.
  - UI rendered and was not blank.
  - JS error logs: none.
  - Direct browser shows `Telegram авторизация не прошла`, expected outside Telegram Mini App.

## Known Caveats
- `scripts/smoke-prod.ps1` is not currently the source of truth for YC prod smoke:
  - it assumes local `docker-compose run` access and readable `.env`;
  - on the YC VM this fails for `yc-user` without loosening secret permissions;
  - do not chmod production secrets only to make this script pass.
- Keep old/previous infrastructure available for at least 24 hours as rollback reference.
- Direct browser validation cannot fully simulate Telegram WebApp `initData`; use real Telegram Mini App or signed test init data for auth-sensitive UI flows.
- Backend log has a `pg` deprecation warning:
  - `Calling client.query() when the client is already executing a query is deprecated...`
  - Not release-blocking, but should be cleaned up in a later hardening pass.

## Recommended Next Steps
1. Commit this updated `HANDOFF.md` if desired.
2. Do a real Telegram Mini App smoke from a phone/account:
   - open bot;
   - tap once;
   - check quests;
   - open shop;
   - open Prestige preview/shop;
   - confirm no auth loop or blank screen.
3. Monitor production for 24 hours:
   - health endpoint;
   - container health;
   - backend logs;
   - BalanceAudit output;
   - Telegram user reports.
4. Improve `scripts/smoke-prod.ps1` for YC:
   - support SSH target;
   - use `sudo docker exec` or HTTP-only mode;
   - avoid reading/chmodding production `.env` directly.
5. Later hardening:
   - remove the `pg` deprecation warning;
   - document rollback command using the pushed image digest/tag;
   - decide whether to move more secrets to Lockbox and standardize deploy automation.

## Useful Commands
```powershell
cd "C:\Users\Имярек\Downloads\Coder Survival\coder_survival_repo\coder_survival_fresh"
git status --short --branch

# Clear invalid env auth before gh/git GitHub operations
$env:GITHUB_TOKEN=$null
$env:GH_TOKEN=$null

# Health
Invoke-RestMethod "https://coder-survival-api.duckdns.org/health" -TimeoutSec 15
Invoke-RestMethod "https://frontend-ashy-alpha-77.vercel.app/health" -TimeoutSec 15

# YC container status/logs
ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -i "C:\Users\Public\cs_openclaw_key" yc-user@111.88.243.88 "sudo docker inspect coder-survival-backend --format 'health={{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} started={{.State.StartedAt}} image={{.Image}}'"
ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -i "C:\Users\Public\cs_openclaw_key" yc-user@111.88.243.88 "sudo docker logs --since=30m --tail=200 coder-survival-backend 2>&1"

# CI status
$env:GITHUB_TOKEN=$null
$env:GH_TOKEN=$null
gh run view 26755938753 --json status,conclusion,headSha,url
```

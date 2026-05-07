# Coder Survival Handoff

## Current state

- Telegram Mini App MVP is live and playable.
- Production backend was re-synced from the current repo on `2026-05-06`.
- Production PostgreSQL latest applied migration is now `007_minimum_economy_instrumentation.sql` (migrations 001–007 are present in repo).
- Vercel production redeploy was completed on `2026-05-06` for:
  - frontend
  - bot webhook runtime
- Vercel + backend release was refreshed again on `2026-05-07` for:
  - frontend
  - backend
  - bot invoice/webhook runtime
- `2026-05-07` server-side context offer cooldowns were released and production-verified
- `2026-05-07` balance tuning pass was released and production-verified:
  - context offer thresholds / cooldowns / priorities
  - weekly hackathon target + reward
  - sprint pass XP source + reward curve
  - daily quest targets + rewards
- `2026-05-07` payment/catalog/instrumentation pass was released and production-verified:
  - active shop catalog unified between backend and bot invoice path
  - server-side Telegram payment confirm verified on live backend
  - minimum economy instrumentation migration `007` applied
  - backend Docker image permissions fixed for `node` runtime
- `2026-05-07` frontend/source-of-truth and smoke expansion pass was released and production-verified:
  - backend now exposes referral / pass / daily metadata needed to remove frontend economy hardcodes
  - production smoke now asserts concrete economy values instead of only endpoint availability
- `2026-05-07` economy observation path was added in repo:
  - protected backend aggregate route `GET /api/internal/observation/economy`
  - operator helper `scripts/observe-economy.ps1`
  - production smoke now validates the observation route on the direct backend upstream
  - route now covers the same 7 observation slices as `observation/01..07_*.sql`
  - two-path model documented in `observation/README.md`:
    - **operator path:** `observe-economy.ps1` → API (fast, aggregate)
    - **deep-dive path:** manual SQL files (full control, validation)
  - operator cheat sheet added in `observation/OPERATOR_CHEATSHEET.md`
- `2026-05-07` truthful energy idle-countdown was released and production-verified:
  - backend `state` and `tap` responses now expose `progressionUpdatedAt` and `serverNow`
  - frontend HUD now shows `+1 энергия через MM:SS, если не тапать` when `energy < maxEnergy`
  - countdown resets on tap/state resync and is explicitly framed as idle-only regen
- `2026-05-07` bot invoice-link path was hardened in repo:
  - bot invoice creation now resolves title/description/amount from backend internal invoice context
  - invoice amount is now sourced from stored `purchases.stars_amount`
  - this removes the previous bot-side price drift path that could trigger `Amount mismatch`
  - `smoke-prod.ps1` now exercises `/api/buy -> bot/api/invoice-link`
- `2026-05-07` legacy cleanup and release hardening were completed in repo:
  - dead legacy `payments/*` Stars mock files removed
  - unused frontend `mockApi.js` removed
  - polling bot entrypoint now hard-fails unless explicitly enabled
  - backend release payload now comes from a filesystem whitelist with a printed manifest and `.env` guard
  - hardened `scripts/release-prod.ps1` was production-validated end-to-end without manual VM sync
- `2026-05-07` backend-only production compose was introduced:
  - operator scripts now use `docker-compose.backend.yml`
  - `docker-compose.prod.yml` remains only as a legacy reference and should not be used as production truth
- reproducible operator scripts now exist:
  - `scripts/release-prod.ps1` — hardened end-to-end release
  - `scripts/release-preflight.ps1` — pre-flight checks (git, secrets, compose, build)
  - `scripts/smoke-prod.ps1` — production API smoke with concrete value assertions
  - `scripts/smoke-offers.ps1` — targeted context-offer smoke
  - `scripts/observe-economy.ps1` — protected live economy observation snapshot
  - `scripts/domain-cutover-check.ps1` — post-cutover domain validation
  - `scripts/set-api-origin.ps1` — frontend API origin switch
  - `scripts/duckdns-update.ps1` — DDNS IP update
  - `scripts/setup-api-host-on-vm.ps1` — VM nginx + certbot provision
  - `scripts/release-manual-checklist.md` — operator step-by-step checklist
- `support/GAMEPLAY_FAQ.md` — operational support FAQ (triage expected behavior vs bug)
- live observation SQL snippets in `observation/` for manual metrics gathering
- `.github/workflows/manual-release.yml` exists only as a CI/manual wrapper draft around `scripts/release-prod.ps1`
- Public user flow works:
  - `/start`
  - WebApp open
  - tap loop
  - leaderboard
  - shop / invoice open
  - premium pass invoice open
  - referral link open
  - event, sprint pass, team panels
- Runtime topology is stable enough for testing:
  - frontend on Vercel
  - backend on VM
  - bot on Vercel webhook

## Live topology

- Frontend:
  - `https://frontend-ashy-alpha-77.vercel.app`
- Public API:
  - `https://frontend-ashy-alpha-77.vercel.app/api/*`
- Public health:
  - `https://frontend-ashy-alpha-77.vercel.app/health`
- Backend upstream:
  - `https://coder-survival-api.duckdns.org`
- Bot webhook:
  - `https://coder-survival-bot.vercel.app/api/webhook`
- VM:
  - `111.88.247.195`
  - app path: `/opt/coder-survival/app`

## Runtime reality

- VM polling bot is not the production path.
- local polling bot entrypoint is kept only for explicit debugging and now requires `ENABLE_POLLING_BOT=true`.
- Root cause:
  - VM cannot reliably reach `https://api.telegram.org`
- Current production flow:
  1. Telegram sends update to Vercel webhook
  2. bot replies with WebApp button
  3. WebApp opens Vercel frontend
  4. frontend uses same-origin `/api/*`
  5. backend on VM persists state to managed PostgreSQL

## Verified behavior

- `/start` responds
- Mini App opens inside Telegram
- taps mutate state
- energy / commits / depression update
- leaderboard opens and loads
- referral links open correctly
- shop opens Telegram Stars invoice flow
- payment confirm path is server-side and idempotent by `telegram_payment_charge_id`
- lazy energy regeneration now works again after reopening state
- context offers trigger on low energy / high stress / near rank-up
- event panel shows active hackathon progress
- sprint pass panel shows level grid with free/premium rewards
- team panel supports create / join-by-code / leave
- `2026-05-06` production API smoke passed through public Vercel `/api` for:
  - health
  - state
  - tap
  - daily quests
  - daily battle
  - event active
  - sprint pass status
  - referral link/stats
  - shop catalog
  - team create / leaderboard / leave
- direct GET to bot webhook returns `401 secret token is wrong` without Telegram secret header
- that bot webhook response is expected and confirms the public Vercel function is alive
- `2026-05-07` direct TLS is live on `https://coder-survival-api.duckdns.org`
- `2026-05-07` post-cutover production smoke also passed after switching Vercel rewrites to DuckDNS upstream
- `2026-05-07` premium pass purchase flow verified through:
  - `/api/buy` for `premium_pass`
  - `bot/api/invoice-link`
  - `/api/internal/payments/telegram/confirm`
- `2026-05-07` `team.total_commits` verified to increase from non-tap reward commits via `tier_boost` confirm
- `2026-05-07` server-side context offer cooldowns verified:
  - direct API returns `low_energy` at `energy=19`
  - `POST /api/offers/dismiss` hides the offer on subsequent state reads
  - frontend Vercel `/api/offers/dismiss` proxy returns `200`
- `2026-05-07` balance tuning verified:
  - balance tuning landed in `006_balance_tuning.sql`
  - public smoke shows weekly hackathon target `650`
  - sprint pass XP now advances from tap XP instead of raw commit delta
  - fresh-user offer smoke passes with dismiss persistence on direct API and via frontend proxy
- `2026-05-07` payment/catalog/instrumentation verified:
  - latest migration is now `007_minimum_economy_instrumentation.sql`
  - public smoke shows shop prices `10 / 40 / 75 / 200`
  - manual live `energy_refill` payment smoke verified `buy -> internal confirm -> energy 88 -> 100`
  - manual live `premium_pass` confirm is idempotent on repeated `telegram_payment_charge_id`
- `2026-05-07` expanded production smoke verified:
  - daily quests assert `40 / 80 / 1` and full-clear bonus `+25 energy`
  - battle reward preview asserts `50 / 30 / 15`
  - event reward payload asserts `+80 energy`, `+60 progress`, `-15 stress`
  - sprint pass asserts `20` rewards, first level `20 XP`, total curve `915 XP`, premium pass price `200`
  - referral stats assert milestones `1 / 3 / 5`, rewards `30 / 60 / 100`, active threshold `20 commits`
- `2026-05-07` live economy observation report is now available without manual SQL access:
  - report includes overview, offers, shop funnel, daily quests, sprint pass, active event and D1 retention
  - route is protected by `OBSERVATION_SECRET` or existing `BOT_BACKEND_SECRET`
  - operator path is `pwsh -File scripts/observe-economy.ps1`
  - response now exposes `sqlSlices` parity for:
    - DAU/retention
    - daily quests
    - context offers
    - weekly hackathon
    - sprint pass
    - shop purchases
    - economy health
- `2026-05-07` energy countdown contract verified:
  - `GET /api/state` and `POST /api/tap` include `progressionUpdatedAt` + `serverNow`
  - production smoke still passes after the payload expansion
  - countdown is a truthful idle timer, not a promise of background energy mutation without sync

## Product state by stage

### Foundation / Stage 1 status

Already present in codebase:
- server-authoritative tap/state loop
- passive energy regeneration
- vNext `player_levels` foundation
- daily quests foundation
- level/rank HUD wiring
- level-up modal / stronger tap feedback
- referral shell
- shop shell

Current v1 progression model:
- ranks:
  - Junior
  - Middle
  - Senior
  - Lead
  - CTO
- daily quests:
  - tap quest
  - commit quest
  - login quest
  - `2026-05-07` tuning:
    - tap quest: `40 taps` → `+15 energy`
    - commit quest: `80 commits` → `+10 energy`, `+30 progress`
    - login quest: `1 login` → `+10 energy`
    - full clear bonus: `+25 energy`

### Stage 2 status

Implemented in codebase:
- Daily Battle v1:
  - `GET /api/battle/today`
  - top players for current UTC day
  - `myPosition`
  - reset timer
  - readonly reward preview
- Referral v2:
  - milestone stats
  - milestone claim flow
  - **Fixed:** milestone reward energy cap now resolves from `player_levels.xp_total` via `ensurePlayerLevel` (was incorrectly using `progression.commits_total`)
- share shell:
  - Telegram share text helpers
  - share from battle / leaderboard / referral UI
- leaderboard polish:
  - daily / weekly / all-time
  - rank-filtered leaderboard
  - my-position block

### Stage 3 status

Implemented in codebase:
- Context Offers v2:
  - improved offer copywriting (pain → offer → action)
  - server-side global + per-type cooldowns to avoid offer fatigue
  - "Open shop" alternative action
  - dismissed offers stay hidden per-type: low_energy 90m, near_rank 2h, high_stress 3h; global cooldown 90s
  - `POST /api/offers/dismiss`
  - `contextOffer` now comes from backend state / tap responses, not `localStorage`
  - `2026-05-07` tuning:
    - priority: `low_energy` → `near_rank` → `high_stress`
    - thresholds:
      - `low_energy`: `<= 25%` energy
      - `near_rank`: `>= 72%` level progress
      - `high_stress`: `>= 55` stress
    - cooldowns:
      - global: `90s`
      - low energy: `90m`
      - near rank: `2h`
      - high stress: `3h`
    - `tier_boost` now aligns with rank progression and grants XP
- Shop v2:
  - product categories (energy / stress / boost)
  - recommended badge based on player state
  - clearer post-purchase feedback via toast
  - compact category tabs
  - **Corrective:** shop open state lives in `GameProvider` (`shopOpen`/`setShopOpen`/`closeShop`); `ContextOfferBanner` opens real shop panel without fake `window.__openShop` seam
- HUD / Interface polish:
  - gradient rank badges
  - improved warning states with pulse animation
  - toast system integrated into StatsBar
  - shop button pulses when low energy / high stress
- Tap feedback / sensory polish:
  - exact feedback driven by server response, no stale delta
  - optimistic path shows only ripple/press/haptic
  - exact path shows floating text + XP + combo + Phaser strength
  - **Corrective:** eliminated double tap feedback; `handlePointerDown` is ripple-only, all exact feedback fires once in `useEffect(lastTapDelta)` when server response arrives
- Onboarding v2:
  - 3-step onboarding (welcome → progression → quests/shop)
  - dot pagination indicator
  - first-session only (localStorage)
- Level-up polish:
  - CSS confetti animation on rank/level up

### Stage 4 status

Implemented in codebase:
- Event System v1:
  - single active weekly hackathon event
  - config-driven (no cron scheduler)
  - personal contribution tracked via `event_contributions`
  - `GET /api/event/active` + `POST /api/event/claim`
  - EventBanner + EventPanel UI
  - **Corrective:** `end_date` seed offset is `+ INTERVAL '6 days'` to yield exactly 7-day inclusive window (`end_date >= CURRENT_DATE`)
  - `2026-05-07` tuning:
    - target: `650` commits
    - reward: `+80 energy`, `+60 progress`, `-15 stress`
- Sprint Pass v1:
  - one active season with 20 levels
  - XP now advances from the normal tap XP curve instead of raw commit delta
  - free track + premium shell (premium branch exists, purchase shell is v1 limitation)
  - `GET /api/pass/status` + `POST /api/pass/claim`
  - SprintPassPanel UI
  - **Corrective:** `end_date` seed offset is `+ INTERVAL '29 days'` to yield exactly 30-day inclusive window (`end_date >= CURRENT_DATE`)
  - `2026-05-07` tuning:
    - active curve total: `915 XP` across 20 levels
    - early levels: `20-35 XP`
    - mid levels: `40-60 XP`
    - late levels: `65-80 XP`
    - reward tracks now mix energy / progress / stress relief
- Teams / Squads v1:
  - creation by name, join by invite code
  - max 5 members
  - simple aggregation (`total_commits`)
  - `POST /api/team/create|join|leave`, `GET /api/team/my|leaderboard`
  - TeamPanel UI
- Shared Reward Helper:
  - `applyReward(client, userId, rewardPayload)` in `utils/rewards.js`
  - used by pass claim + event claim + daily quests
- Anti-cheat boundary:
  - existing rate limits preserved
  - `audit_logs` table for significant actions (claims)
  - **Corrective:** per-tap audit insert removed from `recordEventContribution` to prevent write amplification on hot path
  - advanced anti-cheat explicitly marked as future work

## Known open issues

No active P1 bugs. All previously identified corrective passes are resolved.

### v1 limitations (expected, not bugs)

- **Premium pass scope:** current implementation unlocks premium for the active season via Stars purchase; no multi-season entitlement model yet.

## Important implementation notes

- `player_levels.rank` and `player_levels.level_in_rank` are not treated as authoritative runtime source
- real rank is resolved from `xp_total`
- leaderboard rank filtering was already moved to XP-based bounds
- referral binding should stay server-side via `start_param`
- frontend-side referral sync should stay removed
- frontend must not reintroduce local economy thresholds/reward maps when backend already returns the source-of-truth metadata
- frontend energy countdown must stay derived from backend `progressionUpdatedAt` + `serverNow`; do not replace it with a guessed client-only timer
- shop state must live in `GameProvider` (`shopOpen`/`setShopOpen`); never reintroduce `window.__openShop` or prop-drilling seam
- tap feedback must stay deferred to server response (`useEffect` on `lastTapDelta`); never reintroduce optimistic floating text / particles in `handlePointerDown`
- audit logs must never be written on per-tap hot path; limit to significant actions (claims, purchases)
- release readiness for backend must check Docker container health, not `localhost:3000` on the VM, because backend is `expose`-only in `docker-compose.backend.yml`

## Infrastructure notes

- `coder-survival-api.duckdns.org` is now the active backend upstream hop
- client-facing production URL is the Vercel frontend domain
- host nginx on VM terminates TLS for the upstream path
- duplicate CORS headers were previously fixed
- backend deploy on this VM must use direct `docker build ./backend` + force recreate
- plain `docker-compose up -d backend` is not sufficient here because `latest` can stay pinned to a stale container image
- `docker-compose build --no-cache backend` also produced one stale-image mismatch during the `2026-05-07` offer cooldown release; `scripts/release-prod.ps1` now uses direct `docker build --no-cache -t ... ./backend`
- `2026-05-07` backend Dockerfile needed explicit `chown -R node:node /app`; without it, copied runtime directories could become unreadable for the `node` user inside the container
- `2026-05-07` release payload assembly was changed from git-state filtering to a filesystem whitelist:
  - `backend/Dockerfile`
  - `backend/package.json`
  - `backend/package-lock.json`
  - `backend/src/**`
  - `backend/migrations/**`
  - `docker-compose.backend.yml`
- `scripts/release-prod.ps1` now prints the payload manifest before upload and fails fast if secret files like `.env` / `backend/.env*` are present in the workspace
- operator scripts now target `docker-compose.backend.yml`; `docker-compose.prod.yml` is kept only as a legacy reference while frontend/bot production traffic stays on Vercel
- the old `scripts/deploy.sh` is deprecated on purpose and now acts only as a guard
- legacy files removed from repo: `payments/bot-webhook.js`, `payments/prices.json`, `frontend/src/utils/mockApi.js`

## Release backlog

1. Optionally wrap the now-working PowerShell release path into CI/manual workflow entrypoints.
2. Rotate sensitive secrets if they ever crossed the normal secret boundary.
3. Optionally replace DuckDNS with a fully owned primary domain later.

Current draft wrapper artifacts:
- `.github/workflows/manual-release.yml`
- `scripts/release-manual-checklist.md`

Domain cutover source of truth:
- `DOMAIN_HARDENING_PLAN.md`

No-purchase API upstream path:
- `DUCKDNS_API_PLAN.md`
- default candidate: `coder-survival-api.duckdns.org`

## Balance backlog

1. Validate the new live balance with real player data:
   - context offer CTR / dismiss rate
   - hackathon completion rate at target `650`
   - sprint pass completion pacing against the `915 XP` curve
   - daily quest full-clear rate after `40/80/login` tuning

## Next Chat Split

### Kimi scope

- routine docs/status consistency sweep after future safe patches
- CI/manual wrapper draft around `scripts/release-prod.ps1`
- low-risk repo hygiene:
  - annotate legacy files
  - check import references before deletions
  - prepare operator checklists / release notes templates
- data collection support:
  - summarize metrics gaps
  - prepare SQL/report snippets for manual observation
  - assemble economy observation tables from existing endpoints/tables

### Codex scope

- production-critical backend changes
- release path changes that affect live operator flow
- analytics / metrics schema or API additions
- monetization / economy logic
- deploy + smoke + final integration

### Preferred next implementation focus

1. metrics and live observation tooling for the tuned economy
2. lightweight reporting path for:
   - offer impressions / dismiss / purchase conversion
   - daily quest full-clear rate
   - sprint pass pacing
   - weekly hackathon completion
3. only after enough live data:
   - next balance / monetization decision pass

## Recommended next step

Safe order:
1. watch live metrics on the new balance pass before changing economy again
2. optionally harden release path further in CI/manual entrypoints
3. keep `VNEXT_SPEC.md` / `KIMI_TASKS_VNEXT.md` as ideation material, not production truth
4. do not restore deleted legacy payment mocks; Telegram Stars truth lives in backend shop catalog + bot invoice-link + `/api/internal/payments/telegram/confirm`

## Useful commands

```bash
ssh ubuntu@111.88.247.195
cd /opt/coder-survival/app
docker-compose -f docker-compose.backend.yml ps
docker-compose -f docker-compose.backend.yml logs --tail=100 backend
# docker-compose.prod.yml is legacy reference only; frontend/bot production traffic goes through Vercel
curl -I https://frontend-ashy-alpha-77.vercel.app/health
curl -I https://coder-survival-api.duckdns.org/health
```

## Notes

- Do not put secrets into repo files.
- Keep docs in sync after every stage-level patch.
- Treat `HANDOFF.md` and actual code together; if they diverge, trust code first and update docs immediately.

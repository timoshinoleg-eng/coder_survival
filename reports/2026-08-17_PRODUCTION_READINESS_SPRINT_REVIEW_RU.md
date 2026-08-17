# Coder Survival — Final Production-Readiness Sprint Review

**Дата:** 2026-08-17  
**Автор:** Manus  
**Scope:** B1 rewarded-ad regression, Visual System v2 governance, SOL A3 review и soft-launch blockers  
**Production deploy:** не выполнялся.

## Executive status

Проект заметно приблизился к soft-launch. В `main` уже присутствуют server-authoritative event catalog, migration 059, Visual System v2 specification и формальный SOL A3 review. PR #24 с Art Spec v2 и PR #28 с SOL review были проверены required gates и squash-merged. PR #23 с rewarded-ad ownership/rate-limit fix остаётся отдельным release gate: локальный полный backend suite на изолированной PostgreSQL прошёл, но повторный GitHub Actions run после исправления remote newline corruption ещё выполняется и не должен считаться зелёным до завершения.

> **Release rule:** soft-launch допустим только после green PR #23, production DB migration evidence, secret rotation, explicit CORS allowlist и signed Telegram/Ads smoke. PAYMENTS_ENABLED должен оставаться выключенным до отдельного Stars smoke.

## Verified changes

| Area | Evidence | Status |
|---|---|---|
| Rewarded ads ownership | Clean-main baseline reproduced three 403 ad-claim failures; root cause was PostgreSQL bigint/string versus application numeric user ID comparison. Normalization plus non-owner nonce regression coverage added. | Local backend suite green; GitHub PR #23 pending final CI. |
| Rewarded ads abuse control | Dedicated `rewardedAdRateLimiter` applied to `/ad-session` and `/ad-claim`; CodeQL gate passed after the middleware addition. | Required security checks green; functional CI pending. |
| Visual System v2 | Complete Art Spec v2 merged through PR #24. | Merged. |
| SOL A3 governance | PR #28 records copy acceptance as backlog and keeps art/runtime assets `CHANGES_REQUESTED`; no unapproved runtime asset is authorized. | Merged. |
| Event seed migration | `backend/migrations/059_seed_missing_event_definitions.sql` is present in the current main snapshot. | Production execution still requires owner/operator evidence. |

## Launch blockers

### Production database migration

Migration 059 must be applied and verified against the production database before enabling the expanded event catalog. The repository presence of a migration file is not evidence that it ran in production. The operator should execute the migration through the approved database runbook, verify the nine event definitions and record a timestamped result. No destructive SQL is required for this migration.

### Secret rotation and handling

The infrastructure runbook identifies `BOT_TOKEN`, database credentials, `BOT_BACKEND_SECRET`, `ADMIN_API_SECRET`, `ADSGRAM_SECRET` and `PROPELLER_SECRET` as deployment secrets. The project history previously exposed sensitive material, therefore rotation remains mandatory before public traffic. New values must be placed only in the deployment secret store; they must not be written to the repository, Drive reports or chat.

### CORS allowlist

The backend supports `CORS_ALLOWED_ORIGINS`, but the current code explicitly falls back to permissive `*.vercel.app` preview origins when `FRONTEND_URL` and the allowlist are absent. Production must set an explicit comma-separated allowlist containing only the real frontend origin and approved Telegram/WebView origins. The fallback must not be treated as production configuration.

### Signed Telegram and Ads smoke

A real staging-domain smoke is required for Telegram `initData` validation and the actual AdsGram/approved provider signature path. Mock provider tests are insufficient for release evidence. The smoke must verify nonce creation, provider proof, user ownership, one-time claim, cooldown, daily cap and replay rejection without enabling payments.

### Process-local abuse state

The code still contains process-local maps for tap history, meme buckets and event cooldowns. These are useful as a first-line heuristic but are not durable across restarts or multiple instances. Soft-launch may proceed only with a single-instance operational limit and monitoring, or after moving the critical anti-abuse state to durable storage. The limitation must be documented in the launch decision.

### Payments and Stars

`PAYMENTS_ENABLED` remains a hard safety gate. No card payments or Stars activation should be enabled as part of this sprint. A signed-Stars smoke is a separate owner-approved release task and must not be substituted by mock tests.

## Recommended release sequence

First, wait for PR #23 to complete and require all backend, integration, security and CodeQL gates to pass. Second, execute migration 059 in production and verify the event rows. Third, rotate exposed credentials and set the explicit CORS allowlist. Fourth, run the signed Telegram and Ads smoke on staging. Fifth, run a short single-instance soft-launch with process-local-state monitoring and a rollback plan. Payments remain disabled until an independent Stars readiness decision.

## Open ideas with positive expected value

The safest near-term monetization path remains rewarded ads for Coffee Coins plus cosmetics that never affect taps, energy or leaderboard position. The strongest next content investment is not a larger negative event pool; it is a paired positive/recovery scenario for every two negative incidents, preserving the observed stress curve. For retention, use the already approved copy backlog to add share receipts and blameless postmortem outcomes only after rate limits and replay protection are monitored in staging.

## References

[1]: ../backend/migrations/059_seed_missing_event_definitions.sql — migration 059 present in repository.  
[2]: ../backend/src/index.js — CORS configuration and permissive fallback warning.  
[3]: ../docs/INFRA.md — deployment secret and payment safety runbook.  
[4]: ../visual_assets/first_pack/VISUAL_SYSTEM_V2.md — Visual System v2 contract.  
[5]: ../visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md — asset status vocabulary and approvals.

# Coder Survival — Launch Checklist

**Date:** 2026-07-24 · Companion to `PRODUCTION_READINESS_REPORT.md`.
`[x]` = done in `hyperagent/prod-readiness`; `[ ]` = owner/follow-up.

## Git
- [x] Work off a branch (`hyperagent/prod-readiness`), no direct `main` commits
- [x] Open PRs triaged; stale/dangerous PRs (#1–#6) recommended for close
- [ ] PR reviewed and approved by owner
- [ ] Stale branches pruned (17 remote branches; `ai/freemodel-*`, `cleanup/*`, `rescue/*`, etc.)

## CI
- [x] Backend tests are a real gate (`backend-tests.yml`, Postgres 15 service)
- [x] Migration bootstrap gate added (fresh DB + idempotent re-run)
- [x] `deploy-backend.yml` test step no longer `continue-on-error`
- [x] `claude-agent.yml` auto-triggers disabled (supply-chain risk)
- [x] `security-scan.yml` (CodeQL + TruffleHog + npm audit) retained
- [ ] Archive `render-*.yml`; fix/retire `manual-release.yml`

## Security
- [x] Admin season endpoint authenticated (fail-closed)
- [x] Client XP-mint endpoint removed
- [x] `/api/shop` requires initData
- [x] `git_push_force` respects prestige LOC gate
- [x] Event claim idempotent (atomic gate)
- [x] CORS allowlist tightened (`*.vercel.app` opt-in)
- [x] Bot webhook fail-closed without secret
- [x] `.dockerignore` prevents `.env` in image
- [ ] **Rotate all secrets in git history** (BOT_TOKEN, DB password, BOT_BACKEND_SECRET, webhook secret, Vercel/YC tokens, NVIDIA NGC creds) — OWNER
- [ ] Set `ADMIN_API_SECRET` in production env
- [ ] Shorten `INIT_DATA_MAX_AGE_SECONDS` + add replay cache (follow-up)

## Database
- [x] Fresh-DB bootstrap reproducible (57/57), idempotent re-run
- [x] Runner is transactional and filename-keyed
- [ ] Confirm production `schema_migrations` matches file set; take a backup before deploy
- [ ] Rollback plan rehearsed (no destructive migration in this change set)

## Frontend / Telegram
- [x] Phaser pinned to CANVAS + smoke guard
- [x] Fetch timeout (no infinite spinner)
- [x] Error boundary + boot fallback + `<noscript>`
- [x] Dev initData not sent from production builds
- [x] Safe-area insets for iOS notch
- [x] Purchase UX: no optimistic success before confirmation
- [ ] Add `viewport_changed` handling + initData-race 401 smoothing (follow-up)
- [ ] Manual device pass: iOS + Android Telegram WebView, slow network

## Bot / Telegram
- [x] Webhook verifies secret token (fail-closed)
- [ ] Confirm webhook registered with the secret in BotFather/setWebhook — OWNER
- [ ] Confirm bot outbound egress to Telegram API is stable from the chosen runtime

## Payments
- [x] Stars confirmation is server-authoritative + idempotent (existing, verified)
- [ ] End-to-end signed Stars purchase smoke on staging — OWNER
- [ ] Verify duplicate `successful_payment` callback is a no-op in staging

## Monitoring / observability
- [x] `/health` (DB check) present
- [ ] Alert on 5xx spike, failed/duplicate payment confirms, webhook failures, job failures, migration version
- [ ] Structured logs without initData/secrets; trim per-request auth log noise
- [ ] Confirm no source maps served in production frontend

## Rollback
- [ ] Keep previous Docker image/commit; documented one-command rollback in `DEPLOY.md`
- [ ] Define acceptable downtime window (single-container restart)

## Product (launch-quality, not release blockers)
- [ ] Fix `streak_protect` paid no-op (refund-risk defect)
- [ ] Hide/disable TON Pay placeholder until implemented
- [ ] Fill analytics funnel gaps (9/17 steps missing); stop sending raw `telegram_id` to Amplitude (hash/remove PII)
- [ ] Add D1 re-engagement (at least streak-loss DM)
- [ ] Add satire disclaimer + soften depression/burnout copy (“Депрессия — реальность”, “Depression cured”, “Heart attack imminent!”)
- [ ] In-app support contact + basic FAQ / error codes
- [ ] Do **not** merge `feat/frontend/splash-onboarding` (regresses DeathScreen/analytics/events)

## Go/No-Go
- [ ] All “Security” + “Database” + “Payments” owner items complete → **GO**
- Current status: **CONDITIONAL GO** — code blockers fixed; pending secret rotation, topology confirmation, and a real Telegram smoke.

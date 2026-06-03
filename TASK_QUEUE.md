# Task Queue — Coder Survival vNext

> **Last updated:** 2026-06-03
> **Legend:** 🟢 Ready | 🔵 In Progress | 🟡 Blocked | ✅ Done | ⚪ Icebox

---

## Table

| ID | Фича | Приоритет | Lane | Агент | Статус | Ветка | Notes |
|----|------|-----------|------|-------|--------|-------|-------|
| FEAT-01 | Splash / Onboarding | P1 | frontend | kimi-desktop | 🟢 Ready | feat/splash-onboarding | Phaser splash + HUD + tap feedback |
| FEAT-02 | Career Ladder | P1 | frontend | kimi-desktop | 🟢 Ready | feat/career-ladder | tier/commits XP progression, 3 tiers |
| FEAT-03 | SQL Injection Fix | P0 | backend | kimi-openclaw | 🟢 Ready | fix/sql-injection | audit all raw string queries |
| FEAT-04 | Skin Equip | P2 | frontend | kimi-desktop | 🟢 Ready | feat/skin-equip | avatar skin preview + equip flow |
| FEAT-05 | Shop / Referral | P2 | backend | kimi-openclaw | 🟢 Ready | feat/shop-referral | catalog shell, referral link + stats |
| FEAT-06 | Team Battle Fix | P1 | backend | kimi-openclaw | 🔵 In Progress | fix/team-battle | distribute edge cases, edge rebalance |
| FEAT-07 | Ad SDK Integration | P2 | frontend | kimi-desktop | 🟢 Ready | feat/ad-sdk | adsgram / propeller callbacks |
| FEAT-08 | Cron Jobs | P3 | backend | kimi-openclaw | 🟢 Ready | feat/cron-jobs | daily summary, hackathon, audit |
| FEAT-09 | Antifraud | P1 | backend | kimi-openclaw | 🟡 Blocked | feat/antifraud | needs banScore tuning from analytics |
| FEAT-10 | Analytics | P3 | backend | kimi-openclaw | 🟢 Ready | feat/analytics | event tracking pipeline, GA4+Mixpanel |

---

## Priority Rules

- **P0** — Security / crash / data loss. Fix before anything else.
- **P1** — Core user experience. Next sprint.
- **P2** — Feature parity / revenue. Backlog unless unblocks P1.
- **P3** — Nice to have. Icebox when resources tight.

## Lane Definitions

| Lane | Scope | Typical PR Size |
|------|-------|-----------------|
| frontend | React + Phaser UI, hooks, scenes | ≤400 lines |
| backend | Express routes, utils, jobs | ≤300 lines |
| docs | Specs, README, ADRs | ≤200 lines |
| infra | Docker, CI/CD, nginx | any |

## Agent Assignments

| Агент | Primary Lane | Secondary |
|-------|-------------|-----------|
| @kimi-desktop | frontend | docs |
| @kimi-openclaw | backend | infra |
| @hermes | docs | architecture |

## Notes

- **FEAT-09 (Antifraud)** is blocked on **FEAT-10 (Analytics)** because banScore thresholds need empirical baseline from tracked player data.
- **FEAT-06 (Team Battle Fix)** is in progress — rebalance weights after PP18 deploy data.
- All new backend routes must be added to `API_CONTRACTS.md` before merge.

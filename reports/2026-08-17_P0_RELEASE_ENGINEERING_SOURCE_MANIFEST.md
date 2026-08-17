# P0 Release Engineering — Source Snapshot Manifest

**Дата:** 2026-08-17
**Ветка:** `manus/p0-release-engineering`
**Назначение:** безопасный указатель на проверенный source scope для Google Workspace. Binary artifacts, credential-bearing environment files и runtime logs не включены.

| Commit | Scope | Source / documentation paths |
|---|---|---|
| `0c10b53` | Migration rehearsal 059–061 | `scripts/rehearse_migrations_059_061.mjs`; `backend/tests/rehearseMigrations059061.test.js`; `docs/MIGRATION_RUNBOOK_059_061.md` |
| `3fed5fd` | Signed rewarded-ads smoke | `scripts/smoke_rewarded_ads_harness.mjs`; `backend/tests/smokeRewardedAdsHarness.test.js`; `docs/REWARDED_ADS_SIGNED_SMOKE.md` |
| `c0ae4f5` | Production preflight / observability | `backend/src/config/productionPreflight.js`; `backend/src/index.js`; `backend/tests/productionPreflight.test.js`; `scripts/release_config_preflight.mjs`; `docs/SOFT_LAUNCH_OBSERVABILITY.md` |
| `4d50663` | Luna P1 governance sync | `visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md` |

## Verified local evidence

| Check | Result |
|---|---|
| Full backend regression suite | 45 suites, 435 tests passed on disposable local test database. |
| Migration rehearsal | 62 migrations applied; 059–061 replay stable; 9 event definitions, partial starter-pack index, leagues table and 2 indexes verified. |
| Signed rewarded-ads local smoke | 9/9 checks passed. |
| Secret-safe config preflight | Dedicated unit suite passed; CLI reports named checks only. |

The authoritative source remains the review branch and its future GitHub pull request. This manifest deliberately omits raw database URLs, local network literals, provider credentials, raw Telegram initData, nonce values and logs. It supports traceability while respecting Drive sync safety rules.

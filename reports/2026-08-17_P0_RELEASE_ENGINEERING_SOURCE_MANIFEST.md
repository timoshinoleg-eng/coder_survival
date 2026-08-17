# P0 Release Engineering — Source Snapshot Manifest

**Дата:** 2026-08-17
**Remote review identity:** GitHub PR #32, branch `manus/p0-release-engineering`
**Назначение:** безопасный указатель на проверенный source scope для Google Workspace. Binary artifacts, credential-bearing environment files и runtime logs не включены.

| Remote review scope | Source / documentation paths |
|---|---|---|
| Migration rehearsal 059–061 | `scripts/rehearse_migrations_059_061.mjs`; `backend/tests/rehearseMigrations059061.test.js`; `docs/MIGRATION_RUNBOOK_059_061.md` |
| Signed rewarded-ads smoke | `scripts/smoke_rewarded_ads_harness.mjs`; `backend/tests/smokeRewardedAdsHarness.test.js`; `docs/REWARDED_ADS_SIGNED_SMOKE.md` |
| Production preflight / observability | `backend/src/config/productionPreflight.js`; `backend/src/index.js`; `backend/tests/productionPreflight.test.js`; `scripts/release_config_preflight.mjs`; `docs/SOFT_LAUNCH_OBSERVABILITY.md` |
| Luna P1 governance sync | `visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md`; `visual_assets/first_pack/LUNA_P1_V01_RUNTIME_IDENTITY.json` |

## Verified local evidence

| Check | Result |
|---|---|
| Full backend regression suite | 45 suites, 435 tests passed on disposable local test database. |
| Migration rehearsal | 62 migrations applied; 059–061 replay stable; 9 event definitions, partial starter-pack index, leagues table and 2 indexes verified. |
| Signed rewarded-ads local smoke | 9/9 checks passed. |
| Secret-safe config preflight | Dedicated unit suite passed; CLI reports named checks only. |

The authoritative source is GitHub PR #32 and its current reviewed head, not local working-tree commit IDs. Reviewers must use the GitHub compare/PR file list and the manual-release workflow’s remote revision evidence to identify the exact release candidate. This manifest deliberately omits raw database URLs, local network literals, provider credentials, raw Telegram initData, nonce values and logs. It supports traceability while respecting Drive sync safety rules.

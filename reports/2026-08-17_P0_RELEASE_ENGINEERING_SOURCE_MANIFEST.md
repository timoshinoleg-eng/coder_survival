# P0 Release Engineering — Source Snapshot Manifest

**Снимок:** 2026-08-17 21:36 UTC.
**Remote review scope:** GitHub PR #32, branch `manus/p0-release-engineering`.
**Published remediation head:** `bdf935195860bfeadb85bd8b7eb3984fd68358f0`.
**Current-main resolution state:** local no-force merge includes `main` `983a52461b8c01ce6d686fa6bed6a05703686361`; it must be published before the final review identity is set.

This manifest is a sanitized, repository-held map of source and evidence. It deliberately excludes credential-bearing environment files, raw Telegram data, private runtime logs and binary artifacts. It must be read together with the current PR file list; local commit IDs alone are never authoritative.

## Source and evidence map

| Workstream | Implementation / documentation paths | Evidence / review rule |
|---|---|---|
| Immutable release image identity | `.github/workflows/manual-release.yml`; `scripts/release-image-tag.ps1`; `scripts/release-preflight.ps1`; `scripts/release-prod.ps1`; `docker-compose.backend.yml` | Workflow derives `git-${{ github.sha }}` once; every release-path consumer validates `git-<40-hex-sha>` and refuses `latest`. |
| Post-deploy smoke identity | `scripts/smoke-core-prod.ps1`; `scripts/smoke-offers.ps1`; `backend/tests/releasePathImmutableTag.test.js` | Separate SSH/Compose lookup uses the same exact tag; reachable child offer smoke receives it too. |
| Production preflight / environment contract | `backend/src/config/productionPreflight.js`; `backend/tests/productionPreflight.test.js`; `backend/.env.example`; `docker-compose.backend.yml` | Template contains the compose/preflight variables but no populated secret. |
| Migration rehearsal / operator procedure | `scripts/rehearse_migrations_059_061.mjs`; `backend/tests/rehearseMigrations059061.test.js`; `docs/MIGRATION_RUNBOOK_059_061.md` | Runbook pins reviewed tag and uses `docker compose up --wait` before external health curl. |
| Signed rewarded-ads smoke | `scripts/smoke_rewarded_ads_harness.mjs`; `backend/tests/smokeRewardedAdsHarness.test.js`; `docs/REWARDED_ADS_SIGNED_SMOKE.md` | Owner-gated skips are INCOMPLETE, not PASS. |
| Luna P1 raw review / immutable runtime identity | `reports/2026-08-17_LUNA_P1_V01_RAW_FILE_REVIEW_RU.md`; `visual_assets/first_pack/LUNA_P1_V01_RUNTIME_IDENTITY.json`; `visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md`; `backend/tests/lunaP1RuntimeIdentity.test.js` | Asset identity is path + bytes + dimensions + mode + SHA-256; raw archive itself is intentionally excluded. |
| Durable anti-cheat design preservation | `docs/DURABLE_ANTI_CHEAT_DESIGN_RU.md`; `backend/src/middleware/antiCheat.js`; `backend/migrations/038_anticheat_state.sql` | Documentation-only; no runtime implementation or migration is authorized by PR #32. |
| Workstream status | `docs/SYNC_LOG.md`; `reports/2026-08-17_P0_RELEASE_ENGINEERING_GO_NO_GO_RU.md`; `reports/2026-08-17_P0_RELEASE_ENGINEERING_WORKSTREAM_RELEASE_LEDGER.md` | MERGE GO and PRODUCTION GO remain separate. |

## Validation snapshot

| Check | Result | Limitation |
|---|---|---|
| New immutable-path regression with production-preflight suite | PASS: 2 suites, 15 tests | Static contract coverage; no remote deployment. |
| Full backend suite | 33 passed / 14 skipped suites; 348 passed / 99 skipped tests; 47 suites and 447 tests total | DB-dependent tests skipped because this sandbox has no isolated PostgreSQL service. |
| Frontend smoke + node tests | PASS: smoke plus 14/14 tests | Local only. |
| Frontend production build | PASS: 258 modules transformed | Local only. |
| Compose config and PowerShell parse | Not run | Docker and `pwsh` are unavailable in the sandbox. CI/Windows operator evidence remains required. |

## Publication rule

The next branch update must be fast-forward only and must not merge PR #32. It publishes the current-main resolution and becomes the review identity for CI and the next independent review. PR #31 is still open; if it later truly merges, refresh `main` into PR #32 without force-push and repeat CI/review.

## References

[1]: https://github.com/timoshinoleg-eng/coder_survival/pull/32 "GitHub PR #32"
[2]: ../docs/SYNC_LOG.md "Shared synchronization log"
[3]: 2026-08-17_P0_RELEASE_ENGINEERING_GO_NO_GO_RU.md "GO/NO-GO report"

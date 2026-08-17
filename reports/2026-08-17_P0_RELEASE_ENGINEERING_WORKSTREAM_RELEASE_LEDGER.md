# P0 Workstream / Release Ledger

**Снимок:** 2026-08-17 21:25 UTC.
**Safety posture:** This ledger is sanitized. It contains no credentials, raw production data, runtime logs, private asset URLs or cloud identifiers. It is an operational index, not a production authorization.

> **Decision boundary.** `MERGE GO` means only that a reviewed PR may merge. `PRODUCTION GO` is a later owner-controlled decision for one exact image identity. Neither status is inferred from the other.

## Workstream ledger

| Workstream / PR | Head or durable identity | Report / source of truth | Asset or validation evidence | Status | Next action |
|---|---|---|---|---|---|
| PR #31 — leagues release fix | `c257153339ad83c146ef5133299a3cfc5c9f1a7f` | [GitHub PR #31][1] | 13 completed-success checks; one skipped Macroscope correctness check at snapshot | Open, mergeable/clean | Owner/reviewer decides merge. Manus does not merge. |
| PR #32 — prior reviewed release head | `9b96a9cdb9442eb90926a7cca3f356523875083d` | [GitHub PR #32][2]; [GO/NO-GO][3] | 12/12 successful checks on this old head | Open, but merge remains blocked by the new Codex P1; old CI cannot validate remediation | Publish the local candidate without force-push. |
| PR #32 — immutable-tag remediation candidate | Branch-local at this snapshot; no remote head yet | [Source manifest][4] | `releasePathImmutableTag.test.js`: targeted 2 suites / 15 tests PASS; full backend 47 suites / 447 tests total with sandbox DB skips; frontend smoke, 14 node tests and build PASS | Awaiting publication and CI | Create a reviewable fast-forward update, capture the new GitHub head, wait for CI, request independent Codex review. |
| Release-path runtime contract | One `git-<40-hex-reviewed-sha>` from workflow to preflight, build/migrate/restart, core smoke and offer smoke | [Manual workflow][5]; [preflight][6]; [release][7]; [core smoke][8] | Static regression rejects `latest`, short and malformed tags; compose retains required interpolation | Locally addressed; remote verification pending | CI/Windows runner validates PowerShell and synthetic Compose config. |
| Migration 059–061 operator procedure | Exact tag specified in runbook | [Migration runbook][9] | `docker compose up --wait --wait-timeout 90` precedes external health curl | Documentation cleanup complete locally | Review in PR; do not run production migration. |
| Luna P1 raw review / runtime identity | `luna_p1_v01`, 15 approved runtime exports; each bound to path + bytes + dimensions + mode + SHA-256 | [Raw-review record][10]; [identity manifest][11]; [approval register][12] | Raw inventory metadata records 38 source files; immutable manifest is versioned and sanitized | Durable evidence preserved | Any integrator opens a separate asset PR and verifies identity before copy. |
| Durable anti-cheat P1 design | Documentation-only proposal | [Design preservation][13] | Current process-local middleware and existing JSONB column documented as inputs, not implementation approval | Deferred by explicit scope | Separate architecture/security review must approve schema, transaction/idempotency and rollout before any migration or runtime change. |
| Production owner gates | No production image or execution evidence | [GO/NO-GO production gates][3] | Not run | **PRODUCTION GO: NO-GO** | Owner only: protected-environment preflight, backup/restore, singleton migration/runtime, completed staging smoke and payment kill switch confirmation. |

## Evidence inventory

| Evidence type | Repository-held location | Retention / safety rule |
|---|---|---|
| Shared coordination checkpoint | [`docs/SYNC_LOG.md`](../docs/SYNC_LOG.md) | Append a new block at each major stage; never record secrets. |
| Source scope | [P0 source manifest][4] | GitHub PR head, not local commit labels, is authoritative after publication. |
| Merge and production decisions | [GO/NO-GO report][3] | Keep decisions separate and time-stamped. |
| Release graph regression | [`backend/tests/releasePathImmutableTag.test.js`](../backend/tests/releasePathImmutableTag.test.js) | Must remain green whenever release scripts or Compose calls change. |
| Luna asset identity | [identity manifest][11] | Verify every immutable field; raw binary transport remains out of scope. |
| Anti-cheat future design | [design preservation][13] | No implementation/migration begins without separate review. |

## Handoff sequence

First, publish the remediation candidate without force-push and record the GitHub-reachable head in this ledger. Second, wait for all CI required by PR #32 and request a new independent Codex review. Third, only after PR #31 has actually merged, update PR #32 from fresh `main` without force-push, rerun full CI and request another independent review. No actor should merge PR #32 or perform production operations from this ledger.

## References

[1]: https://github.com/timoshinoleg-eng/coder_survival/pull/31 "GitHub PR #31"
[2]: https://github.com/timoshinoleg-eng/coder_survival/pull/32 "GitHub PR #32"
[3]: 2026-08-17_P0_RELEASE_ENGINEERING_GO_NO_GO_RU.md "P0 GO/NO-GO report"
[4]: 2026-08-17_P0_RELEASE_ENGINEERING_SOURCE_MANIFEST.md "P0 source snapshot manifest"
[5]: ../.github/workflows/manual-release.yml "Manual release workflow"
[6]: ../scripts/release-preflight.ps1 "Release preflight"
[7]: ../scripts/release-prod.ps1 "Release production script"
[8]: ../scripts/smoke-core-prod.ps1 "Core production smoke"
[9]: ../docs/MIGRATION_RUNBOOK_059_061.md "Migration runbook"
[10]: 2026-08-17_LUNA_P1_V01_RAW_FILE_REVIEW_RU.md "Luna raw-file review record"
[11]: ../visual_assets/first_pack/LUNA_P1_V01_RUNTIME_IDENTITY.json "Luna immutable identity manifest"
[12]: ../visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md "Approved assets register"
[13]: ../docs/DURABLE_ANTI_CHEAT_DESIGN_RU.md "Durable anti-cheat design preservation"

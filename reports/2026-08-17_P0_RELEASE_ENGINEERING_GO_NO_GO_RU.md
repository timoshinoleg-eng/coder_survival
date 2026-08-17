# P0 Release Engineering — GO/NO-GO

**Снимок состояния:** 2026-08-17 21:25 UTC.
**Scope:** migration tail `059`–`061`, signed rewarded-ads smoke, production configuration guard, immutable backend image identity, soft-launch observability, Luna P1 governance и documentation-only durable anti-cheat design.

## Two independent decisions

> **MERGE GO: NO-GO / PENDING.** Remote PR #32 is still at reviewed head `9b96a9cdb9442eb90926a7cca3f356523875083d`. The remediation recorded in this worktree has not yet been published, therefore it has no CI result or fresh independent review. The known P1 blocker is only *locally addressed*, not closed.

> **PRODUCTION GO: NO-GO.** This decision is independent of merge. No production deploy, production migration, secret operation, payment enablement or topology change occurred. Production remains owner-gated even after a future MERGE GO.

## Current review state

| Workstream | Current reachable identity | State | Required next action |
|---|---|---|---|
| PR #31 — leagues release fix | `c257153339ad83c146ef5133299a3cfc5c9f1a7f` | Open, mergeable/clean; 13 completed-success checks and one skipped Macroscope correctness check at the snapshot. | Owner/reviewer decides merge; Manus must not merge it. |
| PR #32 — release engineering | Remote reviewed head `9b96a9cdb9442eb90926a7cca3f356523875083d` | Open, mergeable/clean; 12/12 successful checks on the old head. Independent Codex P1 still blocks merge because this old head lacks complete tag propagation. | Publish the local remediation, wait for CI, then request a new independent review. |
| Local PR #32 remediation candidate | Branch-local, not remotely reviewable at this snapshot | Adds exact tag propagation, regression coverage and requested cleanup. | Publish without force-push; record resulting GitHub head and CI. |

The previous CI success of the old PR #32 head is **not evidence** for the new candidate. Likewise, a future MERGE GO does not authorize a production release.

## Local validation evidence

| Check | Result | Interpretation |
|---|---|---|
| Immutable release-path regression + production preflight unit suite | PASS: 2 suites, 15 tests | Validates the static contract: one `git-<40-hex-sha>` identity flows from workflow to preflight, remote build/restart, core smoke and reachable offer smoke; active files contain no mutable `latest` fallback. |
| Full backend suite in this sandbox | PASS with environmental skips: 33 passed / 14 skipped suites; 348 passed / 99 skipped tests; 47 suites and 447 tests total | The new static release-path suite passed. Skips are database-dependent tests not runnable without an isolated PostgreSQL service; this is not a substitute for CI. |
| Frontend smoke and node tests | PASS: smoke checks plus 14/14 node tests | Local frontend behavioral evidence. |
| Frontend production build | PASS | Vite completed with 258 transformed modules. |
| Compose interpolation execution | Not run | Docker CLI is unavailable in this sandbox. No container was created. CI/operator environment must execute the guarded Compose config check. |
| PowerShell parse/execution | Not run | `pwsh` is unavailable in this sandbox. CI/Windows runner must parse and execute the scripts with a synthetic exact tag before release approval. |

## Merge gate status

| Gate | State | Evidence needed for GO |
|---|---|---|
| Exact immutable tag reaches all active release-path Compose calls | Pending remote verification | Published PR #32 diff, green CI and independent review confirm the single reviewed `git-<40-hex-sha>` value across validation, build/restart and smoke. |
| No mutable `latest` release fallback | Locally covered | Published diff and CI regression result. |
| `backend/.env.example` mirrors compose/preflight contract | Locally complete | Published diff review verifies all preflight-controlled variables and release-tag guidance. |
| Migration runbook startup wait | Locally complete | Published diff review verifies `docker compose up --wait` precedes health curl. |
| Traceability and governance records | Locally complete | Published source manifest, Luna raw-review record, anti-cheat design preservation and ledger are reviewed. |
| Independent Code review | Pending | A new independent Codex review after publication; no unresolved merge-blocking finding. |
| Fresh main after PR #31 | Waiting | PR #31 must actually merge first; then PR #32 must take fresh `main` without force-push and rerun full CI. |

## Production gate status

| Gate | State | Required evidence before a separate PRODUCTION GO |
|---|---|---|
| Exact release image | Not run | Owner records the reviewed PR commit and matching immutable image tag; no `latest`. |
| Compose preflight against protected production environment | Not run | Sanitized pass/fail codes only; no secret values in Git, logs or reports. |
| Backup and restore readiness | Not run | Fresh backup and named restore owner recorded in a protected release ticket. |
| Single migration runner and post-check SQL | Not run | One runner, all runbook checks pass, no parallel replica. |
| Backend health/startup | Not run | Compose `--wait` succeeds before external health curl. |
| Signed Telegram/provider staging smoke | Not run | Completed PASS evidence; SKIP/INCOMPLETE is not PASS. |
| Runtime topology | Not verified | Exactly one long-lived backend instance until a separately reviewed durable anti-cheat implementation exists. |
| Payments kill switch | Required at release | `PAYMENTS_ENABLED=false`; this workstream does not authorize payment activation. |

## Explicit non-actions

No production deployment, production database migration, secret rotation/change, payments enablement, force-push or direct merge occurred in this workstream. The reports and manifests intentionally contain no DB URL, IP address, SSH/cloud identifier, raw Telegram initData, nonce, token, provider secret or raw binary asset.

## References

[1]: ../.github/workflows/manual-release.yml "Manual release workflow"
[2]: ../scripts/release-preflight.ps1 "Release preflight"
[3]: ../scripts/release-prod.ps1 "Guarded production release"
[4]: ../scripts/smoke-core-prod.ps1 "Core production smoke"
[5]: ../docs/MIGRATION_RUNBOOK_059_061.md "Migration runbook"
[6]: 2026-08-17_P0_RELEASE_ENGINEERING_SOURCE_MANIFEST.md "P0 source manifest"
[7]: 2026-08-17_LUNA_P1_V01_RAW_FILE_REVIEW_RU.md "Luna P1 raw-file review"
[8]: ../docs/DURABLE_ANTI_CHEAT_DESIGN_RU.md "Durable anti-cheat design preservation"

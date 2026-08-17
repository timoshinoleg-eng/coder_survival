# P0 Release Engineering — GO/NO-GO

**Снимок состояния:** 2026-08-17 21:41 UTC.
**Scope:** migration tail `059`–`061`, signed rewarded-ads smoke, production configuration guard, immutable backend image identity, soft-launch observability, Luna P1 governance и documentation-only durable anti-cheat design.

## Two independent decisions

> **MERGE GO: NO-GO / PENDING.** The current PR #32 head is merge commit `30f85f00f3094014cf51cf0dd1b23f171356c8a3`, with parents `836f65a56d33cd69e8aa6a887b62a7056d7d19d9` and `main` `983a52461b8c01ce6d686fa6bed6a05703686361`. The current-main conflict is resolved without force-push and the full CI matrix has started, but no required check is green and no fresh independent review exists. The P1 blocker is not closed until those gates complete.

> **PRODUCTION GO: NO-GO.** This decision is independent of merge. No production deploy, production migration, secret operation, payment enablement or topology change occurred. Production remains owner-gated even after a future MERGE GO.

## Current review state

| Workstream | Current reachable identity | State | Required next action |
|---|---|---|---|
| PR #31 — leagues release fix | `c257153339ad83c146ef5133299a3cfc5c9f1a7f` | Open, mergeable/clean; 13 completed-success checks and one skipped Macroscope correctness check at the snapshot. | Owner/reviewer decides merge; Manus must not merge it. |
| PR #32 — immutable-tag remediation | Published ancestor `836f65a56d33cd69e8aa6a887b62a7056d7d19d9` | Exact tag propagation and cleanup are reachable in the active PR history. | Reviewed through the current merge head. |
| PR #32 — current review head | `30f85f00f3094014cf51cf0dd1b23f171356c8a3` | Open, mergeable; full CI matrix is in progress. Its second parent is current `main` `983a52461b8c01ce6d686fa6bed6a05703686361`. | Wait for all checks; then request new independent Codex review. |

The old-head CI success is **not evidence** for either the immutable-tag remediation or the current-main resolution. Likewise, a future MERGE GO does not authorize a production release.

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
| Exact immutable tag reaches all active release-path Compose calls | Published, CI/review pending | Current head `30f85f0` needs a green CI set and independent review confirming the single reviewed `git-<40-hex-sha>` value across validation, build/restart and smoke. |
| No mutable `latest` release fallback | Locally covered | Published diff and CI regression result. |
| `backend/.env.example` mirrors compose/preflight contract | Locally complete | Published diff review verifies all preflight-controlled variables and release-tag guidance. |
| Migration runbook startup wait | Locally complete | Published diff review verifies `docker compose up --wait` precedes health curl. |
| Traceability and governance records | Locally complete | Published source manifest, Luna raw-review record, anti-cheat design preservation and ledger are reviewed. |
| Independent Code review | Pending | A new independent Codex review after publication; no unresolved merge-blocking finding. |
| Fresh main after PR #31 | Current main integrated; PR #31 still waiting | Current `main` is a parent of `30f85f0`, removing the present conflict. PR #31 itself remains open; if it later merges, PR #32 must take fresh `main` again without force-push and rerun full CI. |

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

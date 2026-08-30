# Coder Survival — Luna P1 v01 Art Review

**Reviewer:** Manus  
**Review date:** 2026-08-30  
**Branch:** `manus/art-registry-reconciliation` (created from `origin/main`)  
**Scope:** governance-only registry reconciliation and candidate review. No Luna binaries were copied into runtime.

## Verdict

The repository registry was reconciled with the five actual runtime art files in the `main` checkout. Both production-served JPEG key-art files are explicitly registered as `APPROVED_RUNTIME` because they exist at the unchanged paths, are under 40 KB, and are covered by the existing frontend E2E gate. The absent PNG masters are explicitly marked as Drive-only rather than referenced as repository files.

All 15 Luna P1 candidate assets received an individual `APPROVED_RUNTIME` decision for the exact master/runtime hashes recorded in `visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md`. This is an approval decision for governance and future integration; no Luna asset was integrated by this PR. The source archive remains `CANDIDATE` with `integration_allowed=false`.

## Input provenance

The source-of-record was the Google Drive folder `Coder Survival / Visual Assets`, ID `1k8JyvkxHbEy3Y5ue_JB0pxEHFADJle4U`. The raw archive was downloaded from Drive, passed `unzip -t`, and extracted under `/home/ubuntu/luna_p1_v01_extracted/luna_p1_v01` for review. The archive contains 39 entries and the raw inventory describes 38 files.

## D-A — Actual runtime files

| File | Format / dimensions | Bytes | SHA-256 | Decision |
|---|---|---:|---|---|
| `frontend/src/assets/characters/hero_coder_focus.png` | PNG RGBA 128×128 | 28753 | `3eb239da5ee31ac128112afd33b8183dd021e1aee0c54aee0cbc461c509b4992` | `APPROVED_RUNTIME` |
| `frontend/src/assets/characters/hero_coder_strained.png` | PNG RGBA 128×128 | 27344 | `a2e3c5c4b8913d50e6d9db3676a7370a9f2f70df4fdea6819fe452304b5e2175` | `APPROVED_RUNTIME` |
| `frontend/src/assets/characters/hero_coder_collapsed.png` | PNG RGBA 128×128 | 25649 | `f852abb782686c04b3afac9278d1df70885dd513cefcfd9cb8fd7d8b3763ed09` | `APPROVED_RUNTIME` |
| `frontend/public/visual_assets/first_pack/friday_release_outage_keyart_780.jpg` | JPEG 439×780 | 39470 | `c91825da126dfb1d6fae1a95aeef6d4d19c722836b1e046a97d76e09ee63d499` | `APPROVED_RUNTIME` |
| `frontend/public/visual_assets/first_pack/blameless_postmortem_keyart_780.jpg` | JPEG 439×780 | 37383 | `2392b72ea4fb4114d412c6654fecce76ffb2da8f0e1b3b4f700bf1c90ebaae56` | `APPROVED_RUNTIME` |

The former PNG master references were removed from the current-file claims. `hero_coder_style_master` is retained only as a `Drive-only style reference (not committed)`.

## D-B — Luna P1 v01

The 3 hero states and 12 required icon pairs were reviewed individually. The automated report marks every row as pass for dimensions, runtime budget, alpha, and outer-border magenta. Manual review of generated contact sheets confirmed readable silhouettes at runtime scale, distinct palette semantics, consistent hard-edge pixel treatment, transparent edges, and no visible readable text or provider branding. The old exploratory contact-sheet IDs `health`, `focus`, `xp_gain`, `xp_loss`, `sleep`, `bug`, `settings` were not in the raw package and were not used as substitutes.

The exact per-asset master/runtime SHA-256 pairs are recorded in the registry. The 15 decisions are: `hero_coder_coffee`, `hero_coder_incident`, `hero_coder_recovery`, `ui_icon_commit`, `ui_icon_energy`, `ui_icon_stress`, `ui_icon_coffee_coin`, `ui_icon_incident_alert`, `ui_icon_rollback`, `ui_icon_ci_pipeline`, `ui_icon_slack_storm`, `ui_icon_deploy`, `ui_icon_prod_500`, `ui_icon_check`, and `ui_icon_timer` — each `APPROVED_RUNTIME`.

## D-C — Optional verification command

Added `scripts/art-qa.mjs`. It is intentionally not wired into CI. It checks the candidate package’s manifest status, `integration_allowed=false`, inventory file count, file presence, bytes, SHA-256, PNG dimensions, per-asset alpha status, and automated QA rows. It can be run with:

```bash
node scripts/art-qa.mjs \
  --source=/path/to/luna_p1_v01 \
  --output=art-qa-report.json
```

The final run passed with `15 assets, 38 files, all hashes/dimensions/QA gates verified`. The output explicitly records that the source remains a candidate and that the command does not grant runtime integration approval.

## Validation evidence

| Check | Result | Evidence |
|---|---|---|
| ZIP integrity | Passed | `unzip -t` reported no errors |
| Art QA | Passed | `art-qa-report.json`: 15 assets / 38 files |
| Frontend smoke | Passed | `frontend smoke checks passed` |
| Frontend unit tests | Passed | 14 tests, 0 failures |
| Production build | Passed | Vite build, 258 modules transformed |
| Registry whitespace | Passed | `git diff --check` |

## Changed files

Only governance/review files are intended to change in this branch:

- `visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md`
- `scripts/art-qa.mjs`
- `art-qa-report.json`
- `ART_REVIEW_REPORT.md`

No changes were made to `frontend/src/App.jsx`, `frontend/src/main.jsx`, `frontend/src/components/`, `frontend/tests/`, `.github/workflows/`, game logic, API contracts, auth, payments, or existing JPEG names/paths.

## Remaining delivery steps

The worktree is local and based on `origin/main`. Before claiming completion, run `git status`, commit the four changed files, push `manus/art-registry-reconciliation`, verify the commit with `git ls-remote` and the GitHub API, and open/update the PR into `main`. Do not push directly to `main`. Attach this report, `art-qa-report.json`, and the final diff to the PR.

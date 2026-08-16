# Coder Survival — Three-Role Visual Workflow

**Effective date:** 2026-08-16
**Scope:** visual assets, copy, game/UI integration and their supporting documentation.

## Roles

| Role | Owner | May do | Must not do |
|---|---|---|---|
| Art direction & verification | Manus | Own Visual System v2, review Luna candidates, maintain approval register, verify mobile/runtime fit, approve PR acceptance evidence | Integrate unapproved assets or bypass PR review |
| Assets & copy | Luna | Generate candidates, write event/share copy, prepare manifest and requested variants | Modify game code, mark own work approved, place candidates in runtime folders |
| Code & integration | ZCode | Implement approved assets/copy, tests, lazy loading, fallback paths and PR preview evidence | Generate visual direction unilaterally, use non-approved assets, merge directly to `main` |

## Branch and PR rule

All source changes use a branch named `manus/<role>-<short-scope>`, for example `manus/zcode-ci-keyart-overlay` or `manus/luna-share-copy-manifest`. A branch is created from updated `main`; source is never committed directly to `main` and no local publisher script may update `main`.

Every implementation is submitted as a Pull Request targeting `main`. The PR description must state the linked approved Asset IDs, the user-visible goal, exact fallback behaviour, test/build commands and a 390px screenshot or preview link. Existing CI must be green before merge. A merge is permitted only after Manus records visual acceptance and the reviewer confirms runtime/mobile compatibility. Production release remains a protected post-merge operation through the repository’s approved deployment workflow, not a branch publisher.

> Legacy `generate_github_publish_script.py` and `publish_variant_a.ps1` are retired for code delivery. They must not be used to fast-forward `main`.

## Luna asset handoff

1. Luna places non-approved art and copy in a candidate batch outside `runtime/` and includes `asset_manifest_vNN.json`.
2. Manus compares the batch against `VISUAL_SYSTEM_V2.md`, records a decision in `APPROVED_ASSETS_REGISTER.md` and creates a dated report in `reports/`.
3. Only `APPROVED_RUNTIME` assets become an input to a ZCode branch. ZCode may optimise the file but must preserve the asset ID and record transformed dimensions in the PR.
4. Any material change to silhouette, palette semantics, safe zones or copy returns the asset to Luna review.

## Definition of done

| Evidence | Requirement |
|---|---|
| Visual | 390px preview passes the two-second state/action readability test. |
| Technical | Correct runtime format/budget, alpha where required, lazy-load/fallback path where required. |
| Gameplay | No client-side change to authoritative game variables; cosmetic-only rule stays intact. |
| Code quality | Targeted tests, frontend smoke, unit tests and production build are green. |
| Review | Approved Asset ID and Manus acceptance are recorded in the PR and registry. |
| Archive | Dated report plus safe artifacts are saved to Google Drive before the task is closed. |

## Incident path

If a visual change causes a startup issue, Canvas error, readable-text failure or mobile layout shift, ZCode pauses merge, restores the current approved fallback and opens a corrective `manus/zcode-...` PR. Manus re-verifies the correction; Luna only regenerates material when the failure is art-direction related.

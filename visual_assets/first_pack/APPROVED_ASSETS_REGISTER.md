# Coder Survival — Approved Assets Register

**Registry owner:** Manus (art direction & verification)
**Last updated:** 2026-08-17
**Authority:** only entries marked `APPROVED` may be requested by ZCode for product integration.

## Status vocabulary

| Status | Meaning | Code integration |
|---|---|---|
| `CANDIDATE` | Luna draft awaiting review | Forbidden |
| `CHANGES_REQUESTED` | Direction is viable but fails one or more v2 gates | Forbidden |
| `REJECTED` | Does not fit style/technical/safety requirements | Forbidden |
| `APPROVED_MASTER` | Composition and art direction approved; no runtime export accepted yet | Forbidden |
| `APPROVED_RUNTIME` | Master and runtime export validated | Allowed via `manus/*` PR |
| `RETIRED` | Historical material kept for traceability only | Forbidden |

## Approved baseline from v1

| Asset ID | Current file / role | Version | Dimensions | Status | Verification note |
|---|---|---:|---:|---|---|
| `hero_coder_focus` | `frontend/src/assets/characters/hero_coder_focus.png` | v1 | 128×128 PNG | `APPROVED_RUNTIME` | True alpha verified; focus silhouette readable. |
| `hero_coder_strained` | `frontend/src/assets/characters/hero_coder_strained.png` | v1 | 128×128 PNG | `APPROVED_RUNTIME` | True alpha verified; stress pose readable. |
| `hero_coder_collapsed` | `frontend/src/assets/characters/hero_coder_collapsed.png` | v1 | 128×128 PNG | `APPROVED_RUNTIME` | True alpha verified; controlled burnout cue. |
| `keyart_friday_release_outage` | `visual_assets/first_pack/friday_release_outage_keyart.png` | v1 | vertical master | `APPROVED_MASTER` | Safe visual hierarchy in mobile prototype. Runtime WebP still required. |
| `keyart_blameless_postmortem` | `visual_assets/first_pack/blameless_postmortem_keyart.png` | v1 | vertical master | `APPROVED_MASTER` | Recovery palette and CTA hierarchy validated in prototype. Runtime WebP still required. |
| `hero_coder_style_master` | `visual_assets/first_pack/hero_coder_style_master.png` | v1 | square master | `APPROVED_MASTER` | Primary visual reference for Luna; not a runtime file. |

## v2 backlog awaiting Luna

| Asset group | Required IDs | Current status | Required next evidence |
|---|---|---|---|
| Hero expansion | `hero_coder_coffee`, `hero_coder_incident`, `hero_coder_recovery` | `CANDIDATE` | master + 128px alpha export + 390px overlay preview |
| Career scenes | Junior / Senior / CTO stage scene set | `CANDIDATE` | landscape + vertical crop + safe-zone proof |
| UI icons | 12 IDs from Visual System v2 §4.3 | `CHANGES_REQUESTED` | Exact v2 mapping, atomized 96px masters + 48px runtime exports; current SOL atlas is an 11×3 transport draft. |
| Event key art | CI, Slack, 500, Canary plus Friday WebP runtime | `CHANGES_REQUESTED` | 1080×1920 PNG master + ≤280KB WebP + 390px safe-zone proof; current drafts are 440×780 indexed PNGs with insufficient mobile contrast. |
| Share templates | incident receipt, recovery, team huddle | `CANDIDATE` | background master + JSON safe-zone map |
| Content enrichment | 8 incident JSON + 17 RU punchline pairs | `CHANGES_REQUESTED` | Copy is accepted as backlog; normalize RU/EN schema, add runtime adapter/type/weights and run balance evidence before integration. |

## Approval log

| Date | Asset / batch | Decision | Reviewer | Reason |
|---|---|---|---|---|
| 2026-08-16 | Visual System v1 hero trio | `APPROVED_RUNTIME` | Manus | Integrated, alpha verified, frontend smoke and production build passed. |
| 2026-08-16 | Friday / Blameless key art | `APPROVED_MASTER` | Manus | Mobile prototype composition accepted; runtime exports not yet delivered. |
| 2026-08-17 | SOL A3 content, icon atlas and key-art drafts | `CHANGES_REQUESTED` | Manus | Copy is useful backlog; raw art fails v2 dimensions/contrast and atlas is not the exact 12-icon runtime package. No `APPROVED_RUNTIME` granted. |

Luna must append a candidate row before review. Manus records `APPROVED`, `CHANGES_REQUESTED` or `REJECTED` in a dated report and updates this registry. ZCode must reference approved Asset IDs in PR descriptions.

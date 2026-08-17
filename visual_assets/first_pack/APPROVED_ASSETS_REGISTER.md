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
| Hero expansion | `hero_coder_coffee`, `hero_coder_incident`, `hero_coder_recovery` | `APPROVED_RUNTIME` | ZCode must copy verified raw exports in a separate `manus/*` integration PR and provide 390px Phaser/mobile evidence. |
| Career scenes | Junior / Senior / CTO stage scene set | `CANDIDATE` | landscape + vertical crop + safe-zone proof |
| UI icons | 12 IDs from Visual System v2 §4.3 | `APPROVED_RUNTIME` | ZCode must copy verified raw exports in a separate `manus/*` integration PR and provide mobile Phaser preview/smoke evidence. |
| Event key art | CI, Slack, 500, Canary plus Friday WebP runtime | `CHANGES_REQUESTED` | 1080×1920 PNG master + ≤280KB WebP + 390px safe-zone proof; current drafts are 440×780 indexed PNGs with insufficient mobile contrast. |
| Share templates | incident receipt, recovery, team huddle | `CANDIDATE` | background master + JSON safe-zone map |
| Content enrichment | 8 incident JSON + 17 RU punchline pairs | `CHANGES_REQUESTED` | Copy is accepted as backlog; normalize RU/EN schema, add runtime adapter/type/weights and run balance evidence before integration. |

## Luna P1 v01 approved runtime assets

The binary source package is intentionally not duplicated in this governance-only PR. Canonical exports remain in the verified Luna P1 v01 raw archive. ZCode must re-verify the approved file identity when copying it into a separate integration PR; this registry entry is an approval decision, not a replacement for source-asset provenance or runtime evidence.

| Asset ID | Canonical runtime file / source role | Version | Dimensions | Status | Verification note |
|---|---|---:|---:|---|---|
| `hero_coder_coffee` | Luna P1 v01 raw archive: `hero_coder_coffee_runtime_128_v01.png` | v01 | 128×128 RGBA PNG | `APPROVED_RUNTIME` | Master/runtime pair, true alpha and 390px overlay preview verified. |
| `hero_coder_incident` | Luna P1 v01 raw archive: `hero_coder_incident_runtime_128_v01.png` | v01 | 128×128 RGBA PNG | `APPROVED_RUNTIME` | Master/runtime pair, true alpha and 390px overlay preview verified. Incident red remains context-only. |
| `hero_coder_recovery` | Luna P1 v01 raw archive: `hero_coder_recovery_runtime_128_v01.png` | v01 | 128×128 RGBA PNG | `APPROVED_RUNTIME` | Master/runtime pair, true alpha and 390px overlay preview verified. Recovery cue remains green/cyan. |
| `ui_icon_commit` | Luna P1 v01 raw archive: `ui_icon_commit_runtime_48_v01.png` | v01 | 48×48 RGBA PNG | `APPROVED_RUNTIME` | Exact v2 mapping, atomized export and alpha verified. |
| `ui_icon_energy` | Luna P1 v01 raw archive: `ui_icon_energy_runtime_48_v01.png` | v01 | 48×48 RGBA PNG | `APPROVED_RUNTIME` | Exact v2 mapping, atomized export and alpha verified. |
| `ui_icon_stress` | Luna P1 v01 raw archive: `ui_icon_stress_runtime_48_v01.png` | v01 | 48×48 RGBA PNG | `APPROVED_RUNTIME` | Amber non-critical state only; critical red variant requires a separate comprehension review. |
| `ui_icon_coffee_coin` | Luna P1 v01 raw archive: `ui_icon_coffee_coin_runtime_48_v01.png` | v01 | 48×48 RGBA PNG | `APPROVED_RUNTIME` | Exact v2 mapping, atomized export and alpha verified. |
| `ui_icon_incident_alert` | Luna P1 v01 raw archive: `ui_icon_incident_alert_runtime_48_v01.png` | v01 | 48×48 RGBA PNG | `APPROVED_RUNTIME` | Incident-context usage only; no provider logo or baked UI text. |
| `ui_icon_rollback` | Luna P1 v01 raw archive: `ui_icon_rollback_runtime_48_v01.png` | v01 | 48×48 RGBA PNG | `APPROVED_RUNTIME` | Exact v2 mapping, atomized export and alpha verified. |
| `ui_icon_ci_pipeline` | Luna P1 v01 raw archive: `ui_icon_ci_pipeline_runtime_48_v01.png` | v01 | 48×48 RGBA PNG | `APPROVED_RUNTIME` | Exact v2 mapping, atomized export and alpha verified. |
| `ui_icon_slack_storm` | Luna P1 v01 raw archive: `ui_icon_slack_storm_runtime_48_v01.png` | v01 | 48×48 RGBA PNG | `APPROVED_RUNTIME` | Exact v2 mapping, atomized export and alpha verified. |
| `ui_icon_deploy` | Luna P1 v01 raw archive: `ui_icon_deploy_runtime_48_v01.png` | v01 | 48×48 RGBA PNG | `APPROVED_RUNTIME` | Exact v2 mapping, atomized export and alpha verified. |
| `ui_icon_prod_500` | Luna P1 v01 raw archive: `ui_icon_prod_500_runtime_48_v01.png` | v01 | 48×48 RGBA PNG | `APPROVED_RUNTIME` | Incident-context usage only; no provider logo or baked UI text. |
| `ui_icon_check` | Luna P1 v01 raw archive: `ui_icon_check_runtime_48_v01.png` | v01 | 48×48 RGBA PNG | `APPROVED_RUNTIME` | Exact v2 mapping, atomized export and alpha verified. |
| `ui_icon_timer` | Luna P1 v01 raw archive: `ui_icon_timer_runtime_48_v01.png` | v01 | 48×48 RGBA PNG | `APPROVED_RUNTIME` | Exact v2 mapping, atomized export and alpha verified. |

## Approval log

| Date | Asset / batch | Decision | Reviewer | Reason |
|---|---|---|---|---|
| 2026-08-16 | Visual System v1 hero trio | `APPROVED_RUNTIME` | Manus | Integrated, alpha verified, frontend smoke and production build passed. |
| 2026-08-16 | Friday / Blameless key art | `APPROVED_MASTER` | Manus | Mobile prototype composition accepted; runtime exports not yet delivered. |
| 2026-08-17 | SOL A3 content, icon atlas and key-art drafts | `CHANGES_REQUESTED` | Manus | Copy is useful backlog; raw art fails v2 dimensions/contrast and atlas is not the exact 12-icon runtime package. No `APPROVED_RUNTIME` granted. |
| 2026-08-17 | Luna P1 v01: 3 hero states + 12 atomized UI icons | `APPROVED_RUNTIME` | Manus | Raw archive, SHA/bytes inventory, master/runtime dimensions, alpha/chroma and 390px overlays verified. Separate ZCode integration PR remains required. |

Luna must append a candidate row before review. Manus records `APPROVED`, `CHANGES_REQUESTED` or `REJECTED` in a dated report and updates this registry. ZCode must reference approved Asset IDs in PR descriptions.

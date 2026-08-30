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
| `keyart_friday_release_outage` | `frontend/public/visual_assets/first_pack/friday_release_outage_keyart_780.jpg` | v1 | JPEG 439×780 runtime | `APPROVED_RUNTIME` | Actual production-served file; PNG master is not committed and remains in Drive; E2E serves 200 and file is under 40 KB. |
| `keyart_blameless_postmortem` | `frontend/public/visual_assets/first_pack/blameless_postmortem_keyart_780.jpg` | v1 | JPEG 439×780 runtime | `APPROVED_RUNTIME` | Actual production-served file; PNG master is not committed and remains in Drive; E2E serves 200 and file is under 40 KB. |
| `hero_coder_style_master` | Drive-only style reference (not committed) | v1 | square master | `APPROVED_MASTER` | Primary visual reference for Luna; canonical copy remains in Google Drive source-of-record. |

## v2 backlog awaiting Luna

| Asset group | Required IDs | Current status | Required next evidence |
|---|---|---|---|
| Hero expansion | `hero_coder_coffee`, `hero_coder_incident`, `hero_coder_recovery` | `APPROVED_RUNTIME` | ZCode must copy verified raw exports in a separate `manus/*` integration PR and provide 390px Phaser/mobile evidence. |
| Career scenes | Junior / Senior / CTO stage scene set | `CANDIDATE` | landscape + vertical crop + safe-zone proof |
| UI icons | 12 IDs from Visual System v2 §4.3 | `APPROVED_RUNTIME` | ZCode must copy verified raw exports in a separate `manus/*` integration PR and provide mobile Phaser preview/smoke evidence. |
| Event key art | CI, Slack, 500, Canary plus Friday WebP runtime | `CHANGES_REQUESTED` | 1080×1920 PNG master + ≤280KB WebP + 390px safe-zone proof; current drafts are 440×780 indexed PNGs with insufficient mobile contrast. |
| Share templates | incident receipt, recovery, team huddle | `CANDIDATE` | background master + JSON safe-zone map |
| Content enrichment | 8 incident JSON + 17 RU punchline pairs | `CHANGES_REQUESTED` | Copy is accepted as backlog; normalize RU/EN schema, add runtime adapter/type/weights and run balance evidence before integration. |

## D-A — Existing runtime-file reconciliation

The following five files were checked in the actual `main` checkout. They are not Luna P1 assets; this table records the required factual baseline and prevents path/hash drift.

| Runtime file | Format / dimensions | Bytes | SHA-256 | Decision |
|---|---|---:|---|---|
| `frontend/src/assets/characters/hero_coder_focus.png` | `PNG` / 128×128 | 28753 | `3eb239da5ee31ac128112afd33b8183dd021e1aee0c54aee0cbc461c509b4992` | `APPROVED_RUNTIME` |
| `frontend/src/assets/characters/hero_coder_strained.png` | `PNG` / 128×128 | 27344 | `a2e3c5c4b8913d50e6d9db3676a7370a9f2f70df4fdea6819fe452304b5e2175` | `APPROVED_RUNTIME` |
| `frontend/src/assets/characters/hero_coder_collapsed.png` | `PNG` / 128×128 | 25649 | `f852abb782686c04b3afac9278d1df70885dd513cefcfd9cb8fd7d8b3763ed09` | `APPROVED_RUNTIME` |
| `frontend/public/visual_assets/first_pack/friday_release_outage_keyart_780.jpg` | `JPG` / verified | 39470 | `c91825da126dfb1d6fae1a95aeef6d4d19c722836b1e046a97d76e09ee63d499` | `APPROVED_RUNTIME` |
| `frontend/public/visual_assets/first_pack/blameless_postmortem_keyart_780.jpg` | `JPG` / verified | 37383 | `2392b72ea4fb4114d412c6654fecce76ffb2da8f0e1b3b4f700bf1c90ebaae56` | `APPROVED_RUNTIME` |

## D-B — Luna P1 v01 per-asset decisions

All 15 candidate IDs were reviewed individually from the atomized master/runtime files, the 390px hero overlay proofs, the raw inventory, and the automated QA report. Automated checks pass for every asset. Manual visual review found readable silhouettes/semantics, consistent pixel treatment, true alpha, no visible magenta edge contamination, and no readable text or provider branding. These are governance decisions only; no Luna binary is copied into runtime by this PR.

| Asset ID | Master | Runtime | Runtime bytes | Runtime SHA-256 | Decision / evidence |
|---|---|---|---:|---|---|
| `hero_coder_coffee` | `hero_coder_coffee_master_v01.png` / `d645328bca407c2860fc6b31ceaf99b2e623451e5dd02038de214c6643f4a1d1` | `hero_coder_coffee_runtime_128_v01.png` | 10066 | `d3bd1b7142345b0fe2bb392eb4475f84d462cf26c4eda6b01140a62357be9c8c` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `hero_coder_incident` | `hero_coder_incident_master_v01.png` / `8b34d7f33cf3caf5e05ff1ae3cdf10191e74ba229a7448d12dc011d80271fc9c` | `hero_coder_incident_runtime_128_v01.png` | 13506 | `4d57fe117f1161e8c0797e68d42ee0a04d35e36a146878840cc66f942833fce4` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `hero_coder_recovery` | `hero_coder_recovery_master_v01.png` / `aaab7a06e2bee163e05c75c58855ab4bd37ca121c7065e967cb9a2e596819799` | `hero_coder_recovery_runtime_128_v01.png` | 15561 | `ee958b6764e424b9213b010856a867051f715938ebddd266496a4460b95ad344` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `ui_icon_commit` | `ui_icon_commit_master_v01.png` / `9bd1dd14a41202ddc9a3c1d23ab2c148827d34c2e88cfcdda4433b6f653967cb` | `ui_icon_commit_runtime_48_v01.png` | 298 | `c2671ca584e356b47938a9e1a34c1773f095f5d6cc1542b495726ce437a7a4e7` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `ui_icon_energy` | `ui_icon_energy_master_v01.png` / `5d1d9437f7aa6019e97e6bebacededa79c159b1595f67ef744f3c744c4b4f448` | `ui_icon_energy_runtime_48_v01.png` | 223 | `1cddcbd004a5246047ea9c93a8a8d203b30db5d73aeecfb1c5af4d2619642d5d` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `ui_icon_stress` | `ui_icon_stress_master_v01.png` / `e7c4e66dd2eafff38e54abdb36d31a3ff2e5a805cfa1bf2d9005a337896c271b` | `ui_icon_stress_runtime_48_v01.png` | 429 | `677260b8e4fb03fed1dffa9f60be9351c561ce0ecacf78fb7e04d26e9f8b67fd` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `ui_icon_coffee_coin` | `ui_icon_coffee_coin_master_v01.png` / `beee6009e6d168757c154245956daed76b6d4cc52c96d30e75a4154efeefa989` | `ui_icon_coffee_coin_runtime_48_v01.png` | 396 | `38373045e115206b9b0f78bc3eaefc25dc18394da9d984f2df936afe8dc88b4e` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `ui_icon_incident_alert` | `ui_icon_incident_alert_master_v01.png` / `4a142da8abb84b5247142b4e144c0f8d193193f0b2fb3a9437fd0d28c0b3fc83` | `ui_icon_incident_alert_runtime_48_v01.png` | 292 | `35bb18050a7f0d33a5915b37bdf5e40eb5301df76f89648f82847f2c1d5cbc25` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `ui_icon_rollback` | `ui_icon_rollback_master_v01.png` / `9d643f415afa9b3cb6e498a34150f0e1e2b8f58e984d8088b3819260e7ac1508` | `ui_icon_rollback_runtime_48_v01.png` | 341 | `8054d4f75a9a8aabd261eec57378881159046d8e2beaccface3e09befae0ea43` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `ui_icon_ci_pipeline` | `ui_icon_ci_pipeline_master_v01.png` / `f48b063388b31dc7b08678cb1f7ac00213ac84769dc4eab6fa0cf240afa6b289` | `ui_icon_ci_pipeline_runtime_48_v01.png` | 234 | `298a036c1eef501bd8cc959db1d99015d97a23aa47fc3bb3a567a421f8d2991d` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `ui_icon_slack_storm` | `ui_icon_slack_storm_master_v01.png` / `6d808e67e253b99c592aa715ba0727648bbb0b4398f37e026566d889c72f4ccd` | `ui_icon_slack_storm_runtime_48_v01.png` | 289 | `ae45383bde32ce4fff7e2c8f5446883f63eeb5c3e58d3e8eaaa7cd5f442334f9` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `ui_icon_deploy` | `ui_icon_deploy_master_v01.png` / `0b40b362ad15e40df7b53256c7bef9a1a76f644cb69962cd90e7deb31e4ba5f4` | `ui_icon_deploy_runtime_48_v01.png` | 260 | `4eecdc81167c108860b7f2a01705aac8d40f852ef8fa570c26529d538c8811ed` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `ui_icon_prod_500` | `ui_icon_prod_500_master_v01.png` / `6ec7a754cd02366c0b765e8323d0dc2835ec8497d14210af62287e51e85483ba` | `ui_icon_prod_500_runtime_48_v01.png` | 316 | `fc49706acbdf6e60d0d36e65dc94f3ee67bbd1775853e5cfdeb93053128b9b46` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `ui_icon_check` | `ui_icon_check_master_v01.png` / `25b6fc4e231754f458b3cf22707338abf2f2d70f32daab17f83e2ec837c57bea` | `ui_icon_check_runtime_48_v01.png` | 392 | `d46cdead18d368824fddd9120dcf3c50f96dc9f59c68db56a0b55653a4958302` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |
| `ui_icon_timer` | `ui_icon_timer_master_v01.png` / `e9ffe43bae190f1d664ad931dd996fb77f08ca5ca822e8aa0c442f9c1284f48b` | `ui_icon_timer_runtime_48_v01.png` | 363 | `fe1409dc30e0758f8c5659e5858770e735a5b6618a545c84b3e7372dfc43e5de` | `APPROVED_RUNTIME` — dimensions, alpha/chroma, semantic read and required preview/manual gates pass. |

## Approval log

| Date | Asset / batch | Decision | Reviewer | Reason |
|---|---|---|---|---|
| 2026-08-16 | Visual System v1 hero trio | `APPROVED_RUNTIME` | Manus | Integrated, alpha verified, frontend smoke and production build passed. |
| 2026-08-16 | Friday / Blameless key art | `APPROVED_MASTER` | Manus | Mobile prototype composition accepted; runtime exports not yet delivered. |
| 2026-08-17 | SOL A3 content, icon atlas and key-art drafts | `CHANGES_REQUESTED` | Manus | Copy is useful backlog; raw art fails v2 dimensions/contrast and atlas is not the exact 12-icon runtime package. No `APPROVED_RUNTIME` granted. |
| 2026-08-30 | `hero_coder_coffee` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `hero_coder_incident` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `hero_coder_recovery` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `ui_icon_commit` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `ui_icon_energy` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `ui_icon_stress` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `ui_icon_coffee_coin` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `ui_icon_incident_alert` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `ui_icon_rollback` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `ui_icon_ci_pipeline` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `ui_icon_slack_storm` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `ui_icon_deploy` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `ui_icon_prod_500` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `ui_icon_check` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `ui_icon_timer` / Luna P1 v01 | `APPROVED_RUNTIME` | Manus | Individual master/runtime pair, inventory SHA-256, dimensions, true alpha, zero outer-border magenta, semantic/icon readability and applicable overlay evidence verified. |
| 2026-08-30 | `frontend/public/visual_assets/first_pack/friday_release_outage_keyart_780.jpg` / existing production runtime | `APPROVED_RUNTIME` | Manus | Actual path, 39470 bytes, SHA-256 `c91825da126dfb1d6fae1a95aeef6d4d19c722836b1e046a97d76e09ee63d499`, E2E-served and under 40 KB; uncommitted PNG master remains Drive-only. |
| 2026-08-30 | `frontend/public/visual_assets/first_pack/blameless_postmortem_keyart_780.jpg` / existing production runtime | `APPROVED_RUNTIME` | Manus | Actual path, 37383 bytes, SHA-256 `2392b72ea4fb4114d412c6654fecce76ffb2da8f0e1b3b4f700bf1c90ebaae56`, E2E-served and under 40 KB; uncommitted PNG master remains Drive-only. |

Luna must append a candidate row before review. Manus records `APPROVED`, `CHANGES_REQUESTED` or `REJECTED` in a dated report and updates this registry. ZCode must reference approved Asset IDs in PR descriptions. Approval is limited to the exact file hashes recorded above; any replacement file requires a new review.

# Coder Survival — Art Spec v2

**Status:** binding production specification.  
**Owner:** Manus — art direction and verification.  
**Consumers:** Luna — assets and copy; ZCode — code and integration.  
**Source of truth for approval:** [`APPROVED_ASSETS_REGISTER.md`](../visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md). This document defines the delivery contract; it does not by itself approve a candidate.

## 1. Product purpose and non-negotiable visual language

Coder Survival is a Telegram Mini App in which a programmer spends five minutes laughing at familiar IT chaos. Visuals must make one state legible in two seconds on a 390px WebView: **who is affected, whether the system is at risk, and which action is safe next**. Art changes must never modify server-authoritative taps, energy, stress, leaderboards, ad rewards, Coffee Coin value, or any other game balance.

The product world is **Neon Office Survival**: clean 16-bit neo-noir pixel art, hard pixel clusters, dark engineering rooms, a readable silhouette, and no text inside illustrations. The art is game art, not a SaaS dashboard and not a real employee portrait. The governing visual-system source is available in [`VISUAL_SYSTEM_V2.md`](../visual_assets/first_pack/VISUAL_SYSTEM_V2.md).

| Token | Hex | Meaning | Allowed use |
|---|---:|---|---|
| `ink_base` | `#0D1224` | night world and negative space | 55–75% of a scene |
| `panel_ink` | `#151B32` | terminal panel and technical depth | 10–20% |
| `signal_green` | `#62F07B` | control, safe action, recovery | 5–12% |
| `electric_cyan` | `#35D7FF` | monitor, data, CI, SRE signal | 3–9% |
| `coffee_amber` | `#F4A62A` | Coffee Coin, care, human pace | 2–7% |
| `incident_red` | `#FF5E66` | active risk and dangerous refusal | no more than 5%; incident only |
| `soft_paper` | `#E6ECEF` | receipt, contrast text and rare note | no more than 12% |

> **Semantic rule.** Red appears only for a real incident or dangerous state. Green means control or a validated safe action. Amber belongs to coffee, care and human tempo; it cannot impersonate risk.

## 2. Character anchors and mobile composition

Nikita is the primary avatar: dark-green hoodie, square glasses, dark hair and an amber coffee pin. Olya is an optional SRE supporting character: short dark hair, cyan windbreaker and tablet, appearing only in team-safe or recovery contexts. Incidents are shown through neutral system entities—beacon, terminal shake, log ribbon and notification squares—not hostile or caricatured colleagues.

Every mobile composition keeps one focal character and at most two secondary silhouettes. It reserves **12% at top** for title/timer and **18% at bottom** for CTA, reward and device controls. Motion remains procedural Canvas/CSS, 60–220ms, and respects low-power and reduced-motion modes.

## 3. Avatar registry — six gameplay states

Each avatar is delivered as a 512×512 transparent PNG master and a 128×128 transparent PNG runtime sprite at or below 32KB. The runtime sprite can be displayed as 64–128 CSS pixels; nearest-neighbour pixel scaling is mandatory. A candidate with chroma magenta may be reviewed, but its outer 4px runtime border must contain no magenta before it can become `APPROVED_RUNTIME`.

| Asset ID | Trigger | Required pose and state cue | Canonical master | Canonical runtime | Current registry status |
|---|---|---|---|---|---|
| `hero_coder_focus` | stress 0–59 | stable focus, terminal key tick | `hero_coder_focus_master_v01.png` | `hero_coder_focus_runtime_128_v01.png` | `APPROVED_RUNTIME` baseline |
| `hero_coder_coffee` | low energy, stress below 100 | cup/steam, calmer attention | `hero_coder_coffee_master_v01.png` | `hero_coder_coffee_runtime_128_v01.png` | candidate pending registry row |
| `hero_coder_strained` | stress 60–139 | forehead rub, terminal flicker | `hero_coder_strained_master_v01.png` | `hero_coder_strained_runtime_128_v01.png` | `APPROVED_RUNTIME` baseline |
| `hero_coder_incident` | active production or CI incident | alert tremor, log/notification pressure | `hero_coder_incident_master_v01.png` | `hero_coder_incident_runtime_128_v01.png` | candidate pending registry row |
| `hero_coder_recovery` | rollback or Blameless Postmortem success | green settle, relaxed confirmation | `hero_coder_recovery_master_v01.png` | `hero_coder_recovery_runtime_128_v01.png` | candidate pending registry row |
| `hero_coder_collapsed` | stress at or above 140 | controlled collapse, no loop | `hero_coder_collapsed_master_v01.png` | `hero_coder_collapsed_runtime_128_v01.png` | `APPROVED_RUNTIME` baseline |

## 4. Career-stage scene set

Each career scene has a 1920×1080 landscape WebP and 1080×1920 vertical WebP. The Junior scene budget is 320KB per export; Senior and CTO are 350KB per export. They lazy-load only inside onboarding, career card, chapter, event overlay, prestige or share flows; they never block the tap loop.

| Asset ID | Narrative stage | Required composition | Landscape file | Vertical file |
|---|---|---|---|---|
| `scene_stage_junior_cubicle` | Junior first late shift | Nikita at a small desk, two monitors, cyan monitor, amber cup, kind chaos, no red | `scene_stage_junior_cubicle_landscape_16x9_v01.webp` | `scene_stage_junior_cubicle_vertical_9x16_v01.webp` |
| `scene_stage_senior_warroom` | Senior incident triage | Nikita, optional Olya, shared service panel, cyan/green control, red beacon at 5% or below | `scene_stage_senior_warroom_landscape_16x9_v01.webp` | `scene_stage_senior_warroom_vertical_9x16_v01.webp` |
| `scene_stage_cto_commandfloor` | CTO calm command floor | one focal decision point, high-level service map, team context, no villain imagery | `scene_stage_cto_commandfloor_landscape_16x9_v01.webp` | `scene_stage_cto_commandfloor_vertical_9x16_v01.webp` |

## 5. UI icon set — 24px/32px display contract

The canonical art master is **96×96 PNG RGBA**. A high-density **48×48 PNG RGBA runtime export** is required and is rendered by code at **24×24px in HUD** or **32×32px in choice/event cards**. This preserves hard pixels on Telegram density classes without shipping multiple unrelated art styles. Icons have a 1px dark outline, transparent background and no letters, numbers, provider marks or brand logos.

| Asset ID | Product meaning | Semantic color | Runtime filename |
|---|---|---|---|
| `ui_icon_commit` | commits/source control | cyan + paper | `ui_icon_commit_runtime_48_v01.png` |
| `ui_icon_energy` | energy/capacity | green | `ui_icon_energy_runtime_48_v01.png` |
| `ui_icon_stress` | stress meter | amber; red only if critical | `ui_icon_stress_runtime_48_v01.png` |
| `ui_icon_coffee_coin` | earned Coffee Coin | amber | `ui_icon_coffee_coin_runtime_48_v01.png` |
| `ui_icon_incident_alert` | active incident | red | `ui_icon_incident_alert_runtime_48_v01.png` |
| `ui_icon_rollback` | safe rollback choice | green | `ui_icon_rollback_runtime_48_v01.png` |
| `ui_icon_ci_pipeline` | CI/CD state | cyan; red only fail variant | `ui_icon_ci_pipeline_runtime_48_v01.png` |
| `ui_icon_slack_storm` | chat-thread overload | cyan with limited red | `ui_icon_slack_storm_runtime_48_v01.png` |
| `ui_icon_deploy` | deploy action | cyan | `ui_icon_deploy_runtime_48_v01.png` |
| `ui_icon_prod_500` | production 500 | red | `ui_icon_prod_500_runtime_48_v01.png` |
| `ui_icon_check` | validated success | green | `ui_icon_check_runtime_48_v01.png` |
| `ui_icon_timer` | decision countdown | paper + cyan | `ui_icon_timer_runtime_48_v01.png` |

Status variants use only `{base|active|critical}` when a variant changes player comprehension. Decorative recolours are forbidden.

## 6. Top-five event key art and recovery contextual art

All event masters are **1080×1920 PNG**. Each production runtime is a vertical WebP at 280KB or below. Art remains text-free: ZCode owns UI labels, timer, action button and dynamic incident data.

| Asset ID | Event composition | Runtime filename | Status at time of this spec |
|---|---|---|---|
| `keyart_friday_release_outage` | upper-right beacon, dark central terminal, clear top/bottom safe areas | `keyart_event_friday_release_outage_webp_v01.webp` | `APPROVED_MASTER`; runtime required |
| `keyart_ci_pipeline_red` | build lane, broken check sequence, Nikita reading logs, red no more than 5% | `keyart_event_ci_pipeline_red_webp_v01.webp` | candidate |
| `keyart_slack_thread_storm` | notification squares around a quiet player; no readable chat or provider logo | `keyart_event_slack_thread_storm_webp_v01.webp` | candidate |
| `keyart_production_500_spike` | server graph spike, log rain, no gore or panic caricature | `keyart_event_production_500_spike_webp_v01.webp` | candidate |
| `keyart_canary_rollback` | green recovery path overtakes restrained red branch | `keyart_event_canary_rollback_webp_v01.webp` | candidate |
| `keyart_blameless_postmortem` | contextual recovery/post-event loop; warm note inside ink frame | `keyart_event_blameless_postmortem_webp_v01.webp` | `APPROVED_MASTER`; runtime required |

## 7. Share-card template set

Luna supplies only text-free background art plus a JSON safe-zone map. ZCode renders all player data from a server-authoritative contract; no personal data, credentials or user chat content is included in master art.

| Template ID | Format | Purpose | Required dynamic fields | Background filename |
|---|---:|---|---|---|
| `share_card_incident_receipt` | 1200×630 | incident receipt | hero state, event title, choice, commits/stress delta | `share_card_incident_receipt_master_v01.png` |
| `share_card_rollback_recovery` | 1080×1920 | recovery timeline | choice, recovery result, visual-only Coffee Coin cue | `share_card_rollback_recovery_master_v01.png` |
| `share_card_team_huddle` | 1080×1080 | team-safe huddle/postmortem | event and team-safe status only | `share_card_team_huddle_master_v01.png` |

## 8. Naming, folders and manifest

The canonical pattern is:

```text
<family>_<subject>_<state-or-event>_<variant>_vNN.<ext>
```

All names are lower-case snake_case. Do not use spaces, `final`, personal names, provider names, raw prompt text or credential-like fragments. Approved masters belong in `visual_assets/first_pack/masters/`; approved runtime files belong in `visual_assets/first_pack/runtime/`; candidates stay outside these folders until Manus updates the registry.

Every Luna batch includes `asset_manifest_vNN.json` with `asset_id`, filename, version, dimensions, format, alpha status, palette tokens, prompt summary without credentials, intended UI location and preview path. It must not contain an IP, SSH material, cloud/resource ID, endpoint, secret, token or credential.

## 9. Acceptance and handoff gates

| Gate | Pass condition | Accountable role |
|---|---|---|
| Style and silhouette | same Neon Office Survival world; state readable at 128px and 390px | Manus |
| Semantic palette | red/green/amber comply with their meaning | Manus |
| Mobile safe zones | timer, CTA and event copy remain clear over intended crop | Luna → Manus |
| Runtime integrity | exact dimensions, true alpha, no magenta edge, budget respected | Luna → Manus |
| Safety | no logos, readable fake chat, personal data, credentials or colleague caricature | Manus |
| Integration | no layout shift, Canvas crash or low-power regression | ZCode |
| Approval | individual Asset ID marked `APPROVED_RUNTIME` in registry | Manus |

> **Handoff rule.** Luna submits individual files, previews and manifest. Manus records a dated decision and changes the registry only with evidence. ZCode integrates only exact `APPROVED_RUNTIME` filenames through a `manus/*` branch and Pull Request. Contact sheets, generated placeholders and `APPROVED_MASTER` art are not runtime dependencies.

## 10. Current production order

The fastest safe integration sequence is: hero states first, then the 12 UI icons, then Friday/Blameless runtime WebP, followed by the five event key arts, career scenes and share templates. No visual task bypasses the acceptance gates above, because a broken alpha edge, a baked logo or an unreadable mobile crop reduces rather than improves retention.

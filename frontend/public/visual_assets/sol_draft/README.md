# SOL A3 draft assets

Status: **draft / review-only**. These files are not `APPROVED_RUNTIME` and must not be wired into production by path.

## Why this folder exists

Package A3 explicitly requested fast 24×32 PNG explorations (three variants each) for: energy, stress, commits, coffee coin, shop, quests, pass, team, leaderboard, memes, settings, plus three ~440×780 event keyart drafts.

After A3 started, `docs/ART_SPEC_V2.md` became the binding production contract. It defines a different canonical UI delivery model:

- 96×96 RGBA master;
- 48×48 RGBA runtime;
- rendered by code at 24×24 in HUD or 32×32 in choice/event cards;
- exact production IDs: `ui_icon_commit`, `ui_icon_energy`, `ui_icon_stress`, `ui_icon_coffee_coin`, `ui_icon_incident_alert`, `ui_icon_rollback`, `ui_icon_ci_pipeline`, `ui_icon_slack_storm`, `ui_icon_deploy`, `ui_icon_prod_500`, `ui_icon_check`, `ui_icon_timer`;
- status variants only when they communicate a real state change; decorative recolours are not production variants.

Therefore the 33 A3 24×32 files remain reversible concept/display-size drafts. They satisfy the original A3 exploration brief but **do not satisfy the binding production icon registry**. `shop`, `quests`, `pass`, `team`, `leaderboard`, `memes`, and `settings` are future/backlog semantics unless separately specified and approved.

The A3 keyarts are likewise composition drafts only. Production event art requires 1080×1920 PNG masters, text-free safe zones, and ≤280 KB WebP runtime exports after Manus review.

## Integration rule

ZCode must use only exact filenames marked `APPROVED_RUNTIME` in `visual_assets/first_pack/APPROVED_ASSETS_REGISTER.md`. Nothing under `sol_draft/` is an integration dependency.

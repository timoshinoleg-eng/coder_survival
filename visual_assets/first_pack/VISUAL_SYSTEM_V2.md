# Coder Survival — Visual System v2

**Дата:** 2026-08-16
**Владелец визуального направления:** Manus (art direction & verification)
**Статус:** обязательная спецификация для новых assets, copy и UI-интеграций.

## 1. Назначение и границы

Visual System v2 развивает **Neon Office Survival** из v1. Цель — сделать каждое состояние игры мгновенно читаемым на 390px Telegram WebView: игрок должен за две секунды видеть героя, тональность incident/recovery и следующий доступный action. Система не меняет server-authoritative баланс, taps, энергию, stress, leaderboard или монетизацию.

> **Правило v2:** красный сообщает только о реальном риске или incident; terminal green — о контроле и правильном действии; amber — о кофе, заботе и человеческом темпе. Остальные цвета не могут подменять эти значения.

## 2. Style master

| Параметр | Обязательное решение |
|---|---|
| Направление | Чистый 16-bit neo-noir pixel art; чёткие кластеры пикселей, сильный силуэт, без фотореализма и без текста внутри иллюстрации. |
| Место | Ночная инженерная среда: desk, terminal, service panels, log stream, coffee station. |
| Главный персонаж | Никита: dark-green hoodie, квадратные очки, тёмные волосы, янтарный coffee pin. Не является портретом реального человека. |
| Supporting character | Оля, SRE: короткие тёмные волосы, cyan windbreaker, tablet. Только recovery/team-safe сцены, без образа «спасительницы». |
| Incident | Безликая системная сущность: red beacon, shaking terminal, log ribbon, notification squares. Никаких карикатур на коллег. |
| Mobile frame | Один focal character, не более двух вторичных силуэтов; safe zone 12% сверху и 18% снизу для UI. |
| Motion | Процедурный Canvas/CSS: 60–220 ms. Видео не входит в gameplay core. |

## 3. Палитра и допустимые пропорции

| Token | Hex | Семантика | Ориентир по сцене |
|---|---:|---|---:|
| `ink_base` | `#0D1224` | Ночной мир, фон и отрицательное пространство | 55–75% |
| `panel_ink` | `#151B32` | Terminal panel, card interior, техническая глубина | 10–20% |
| `signal_green` | `#62F07B` | Control, correct action, ready, recovery | 5–12% |
| `electric_cyan` | `#35D7FF` | Монитор, SRE, data signal | 3–9% |
| `coffee_amber` | `#F4A62A` | Coffee Coin, care, human tempo | 2–7% |
| `incident_red` | `#FF5E66` | Alert, production risk, dangerous refusal | ≤5%; только incident |
| `soft_paper` | `#E6ECEF` | Контрастный текст, receipts, редкие postmortem notes | ≤12% |

Purple gradients, pastel SaaS surfaces, glow без смыслового статуса и белый фон во весь экран запрещены. В recovery допустим тёплый paper-note блок, но только внутри dark ink frame и с amber/green terminal markers.

## 4. Реестр production assets

### 4.1 Главный герой: обязательный набор из шести состояний

| Asset ID | State / trigger | Master | Runtime | Motion cue | Первичный статус |
|---|---|---:|---:|---|---|
| `hero_coder_focus` | Stress 0–59, stable focus | 512×512 PNG RGBA | 128×128 PNG RGBA, ≤32 KB | 2px breathing / key tick | Approved v1 baseline |
| `hero_coder_coffee` | Energy low, stress <100 | 512×512 PNG RGBA | 128×128 PNG RGBA, ≤32 KB | steam / cup tilt | Brief ready |
| `hero_coder_strained` | Stress 60–139 | 512×512 PNG RGBA | 128×128 PNG RGBA, ≤32 KB | forehead rub / terminal flicker | Approved v1 baseline |
| `hero_coder_incident` | Active production / CI event | 512×512 PNG RGBA | 128×128 PNG RGBA, ≤32 KB | 1px alert tremor | Brief ready |
| `hero_coder_recovery` | Blameless Postmortem / rollback success | 512×512 PNG RGBA | 128×128 PNG RGBA, ≤32 KB | 1px green settle | Brief ready |
| `hero_coder_collapsed` | Stress ≥140 / burnout | 512×512 PNG RGBA | 128×128 PNG RGBA, ≤32 KB | no loop; controlled collapse burst | Approved v1 baseline |

Runtime sprites must use transparent alpha. A temporary `#FF00FF` chroma background is permitted only in a Luna source export when the generation system cannot return alpha; it must be removed before approval. Runtime PNG cannot retain magenta pixels in its outer 4px border.

### 4.2 Career stage scenes

| Asset ID | Narrative stage | Required composition | Master / runtime | Load rule |
|---|---|---|---|---|
| `scene_stage_junior_cubicle` | Junior: first late shift, two monitors, too many tabs, kind chaos | Nikita at small desk; one cyan monitor, amber cup; no red | 1920×1080 + 1080×1920 WebP, each ≤320 KB | Lazy for onboarding / career card |
| `scene_stage_senior_warroom` | Senior: incident triage, shared service panel, team signal | Nikita + optional Olya; terminal green/cyan, red beacon ≤5% | 1920×1080 + 1080×1920 WebP, each ≤350 KB | Lazy for chapter / event overlay |
| `scene_stage_cto_commandfloor` | CTO: calm command floor, high-level service map, team context | Olya optional; 1 focal decision point, no villain imagery | 1920×1080 + 1080×1920 WebP, each ≤350 KB | Lazy for prestige / share |

### 4.3 UI icon set

Icons share a 1px dark outline, hard pixel edges, transparent background and a 96×96 master / 48×48 runtime export. No icon contains letters or numbers.

| Asset ID | Semantic token | Color authority |
|---|---|---|
| `ui_icon_commit` | commits / source control | cyan + paper |
| `ui_icon_energy` | energy / capacity | green |
| `ui_icon_stress` | stress meter | amber below risk, red only at critical |
| `ui_icon_coffee_coin` | earned Coffee Coin | amber |
| `ui_icon_incident_alert` | active incident | red |
| `ui_icon_rollback` | safe rollback choice | green |
| `ui_icon_ci_pipeline` | CI/CD state | cyan; red only fail variant |
| `ui_icon_slack_storm` | chat thread overload | cyan + limited red |
| `ui_icon_deploy` | deploy action | cyan |
| `ui_icon_prod_500` | production 500 | red |
| `ui_icon_check` | validated success | green |
| `ui_icon_timer` | decision countdown | paper + cyan |

Each status-driven icon can ship in `{base|active|critical}` variants only where that variant changes player comprehension. Decorative recolours are not a valid reason for variants.

### 4.4 Key art: top-five visual events

| Asset ID | Event | Composition and safe zones | Master / runtime |
|---|---|---|---|
| `keyart_friday_release_outage` | Friday Release Outage | Red beacon at upper-right, dark central terminal, safe top/bottom UI zones | 1080×1920 PNG master; WebP ≤280 KB |
| `keyart_ci_pipeline_red` | CI Pipeline Red | Build lane, broken check sequence, Nikita reading logs; red ≤5% | 1080×1920 PNG master; WebP ≤280 KB |
| `keyart_slack_thread_storm` | Slack Thread Storm | Notification squares spiral around quiet player; no readable chat text or logos | 1080×1920 PNG master; WebP ≤280 KB |
| `keyart_production_500_spike` | HTTP 500 Spike | Server graph spike, log rain, no gore / panic caricature | 1080×1920 PNG master; WebP ≤280 KB |
| `keyart_canary_rollback` | Canary Rollback | Green recovery path overtakes a restrained red branch | 1080×1920 PNG master; WebP ≤280 KB |

`keyart_blameless_postmortem` остаётся обязательным contextual recovery asset вне top-five: он нужен для post-event loop и share, но не считается случайным event.

### 4.5 Share-card templates

| Template ID | Формат | Narrative | Dynamic fields |
|---|---:|---|---|
| `share_card_incident_receipt` | 1200×630 | «18:57. Прод решил поговорить.»; incident receipt | hero state, event title, chosen action, commits/stress delta |
| `share_card_rollback_recovery` | 1080×1920 | rollback → green recovery timeline | action, recovery result, Coffee Coin visual-only cue |
| `share_card_team_huddle` | 1080×1080 | team-safe postmortem / Slack huddle | event, team-safe status, no private user data |

Share template overlays are generated by code only after ZCode integrates a server-authoritative data contract. Luna supplies backgrounds and safe zones; no player data is rendered into master art.

## 5. Naming, folders и delivery format

### 5.1 Canonical filename

`<family>_<subject>_<state-or-event>_<variant>_vNN.<ext>`

| Segment | Values / example |
|---|---|
| `family` | `hero`, `scene`, `ui`, `keyart`, `share` |
| `subject` | `coder`, `stage`, `icon`, `event`, `card` |
| state/event | `focus`, `senior_warroom`, `ci_pipeline_red` |
| variant | `master`, `runtime_128`, `vertical_9x16`, `webp`, `base` |
| version | zero-padded, e.g. `v01`, `v02` |

Examples: `hero_coder_incident_runtime_128_v01.png`, `scene_stage_senior_warroom_vertical_9x16_v01.webp`, `keyart_event_ci_pipeline_red_vertical_9x16_v01.png`.

Filenames are lower-case snake_case. Do not use spaces, final/final2, personal names, provider names or raw prompt text. Masters live in `visual_assets/first_pack/masters/`; runtime candidates live in `visual_assets/first_pack/runtime/`; candidate assets remain outside these directories until approval.

### 5.2 Luna delivery manifest

Every candidate batch must include `asset_manifest_vNN.json` with: `asset_id`, filename, version, dimensions, format, alpha status, palette tokens used, prompt summary without credentials, intended UI location and preview path. No IP, SSH, cloud/provider resource ID or internal endpoint may appear in the manifest, prompt or filename.

## 6. Mandatory art acceptance criteria

An asset is approved only if it passes every required check:

| Gate | Pass condition |
|---|---|
| Style | Reads as the same 16-bit Neon Office Survival world as `hero_coder_focus`, `hero_coder_strained`, `hero_coder_collapsed`. |
| Silhouette | State is understandable at 128px and at 390px WebView without explanatory copy. |
| Semantics | Red/green/amber obey the palette authority; no accidental red decoration. |
| UI safe area | Timer, CTA and event copy remain readable over the intended crop. |
| Runtime | Correct dimensions, true alpha for sprites, no visible magenta key, compressed runtime within budget. |
| Safety | No branded Slack/CI logos, personal data, credentials, real employee likeness or hostile colleague caricature. |
| Integration | ZCode preview demonstrates no layout shift, Canvas crash or mobile low-power regression. |

## 7. Motion and video boundary

Gameplay uses only procedural micro-motion: 60–220 ms transform/opacity/Canvas effects, low-power guard and `prefers-reduced-motion` fallback. A 6–8 second vertical video is permitted only as a future acquisition/share deliverable after its storyboard is approved and only outside the Mini App core loop.
